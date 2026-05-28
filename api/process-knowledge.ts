import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PDFParse } from 'pdf-parse';
import {
  createSupabaseAdminClient,
  HttpError,
  requireAuthenticatedUser,
  sendError,
  setCorsHeaders,
} from '../server/api-utils';

interface KnowledgeFileRecord {
  id: string;
  user_id: string;
  user_agent_id: string | null;
  file_name: string;
  storage_path: string;
}

function splitIntoChunks(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  const paragraphs = normalized.split(/\n\s*\n/).map((chunk) => chunk.trim()).filter(Boolean);

  for (const paragraph of paragraphs.length > 0 ? paragraphs : [normalized]) {
    if (paragraph.length <= 2000) {
      chunks.push(paragraph);
      continue;
    }

    const subChunks = paragraph.match(/[\s\S]{1,1500}/g) || [];
    chunks.push(...subChunks.map((chunk) => chunk.trim()).filter(Boolean));
  }

  return chunks;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let authenticatedUserId: string | null = null;
  let requestedFileId: string | null = null;

  try {
    const supabase = createSupabaseAdminClient();
    const { user } = await requireAuthenticatedUser(req, supabase);
    authenticatedUserId = user.id;

    const { fileId, agentId, userId } = req.body as {
      fileId?: string;
      agentId?: string;
      userId?: string;
    };
    requestedFileId = fileId || null;

    if (!fileId || !agentId) {
      throw new HttpError(400, 'Missing required fields');
    }

    if (userId && userId !== user.id) {
      throw new HttpError(401, 'Unauthorized');
    }

    if (!process.env.GEMINI_API_KEY) {
      throw new HttpError(500, 'Gemini API key is not configured.');
    }

    // 1. Fetch file record from DB
    const { data: fileRecord, error: fetchError } = await supabase
      .from('agent_knowledge_files')
      .select('*')
      .eq('id', fileId)
      .eq('user_id', user.id)
      .maybeSingle<KnowledgeFileRecord>();

    if (fetchError || !fileRecord) {
      throw new HttpError(404, 'File record not found');
    }

    if (fileRecord.user_agent_id && fileRecord.user_agent_id !== agentId) {
      throw new HttpError(403, 'File does not belong to this agent');
    }

    // 2. Download file from Supabase Storage
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('knowledge_files')
      .download(fileRecord.storage_path);

    if (downloadError || !fileBlob) {
      throw new Error('Failed to download file from storage');
    }

    // 3. Extract text
    let extractedText = '';
    const arrayBuffer = await fileBlob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const lowerName = fileRecord.file_name.toLowerCase();

    if (lowerName.endsWith('.pdf')) {
      const parser = new PDFParse({ data: buffer });
      try {
        const pdfData = await parser.getText();
        extractedText = pdfData.text;
      } finally {
        await parser.destroy();
      }
    } else if (/\.(txt|md|csv)$/i.test(lowerName)) {
      // Assume text-based file (txt, md, csv)
      extractedText = buffer.toString('utf-8');
    } else {
      throw new HttpError(400, 'Unsupported file type. Upload PDF, TXT, MD, or CSV files.');
    }

    if (!extractedText.trim()) {
      throw new Error('No text extracted from file');
    }

    // 4. Chunk the text (simple chunking by paragraphs or length)
    const finalChunks = splitIntoChunks(extractedText);

    if (finalChunks.length === 0) {
      throw new Error('No usable text chunks extracted from file');
    }

    // 5. Generate embeddings and store in DB
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
    let storedChunks = 0;
    
    for (const chunk of finalChunks) {
      try {
        const result = await model.embedContent(chunk);
        const embedding = result.embedding.values;

        // Insert into pgvector
        const { error: insertError } = await supabase
          .from('knowledge_embeddings')
          .insert({
            file_id: fileId,
            user_id: user.id,
            content: chunk,
            embedding,
          });

        if (insertError) {
          console.error('Error inserting embedding:', insertError);
        } else {
          storedChunks += 1;
        }
      } catch (embErr) {
         console.error('Error generating embedding for chunk:', embErr);
      }
    }

    if (storedChunks === 0) {
      throw new Error('No embeddings were stored');
    }

    // 6. Update file status to completed
    await supabase
      .from('agent_knowledge_files')
      .update({ status: 'completed' })
      .eq('id', fileId);

    return res.status(200).json({
      success: true,
      message: 'File processed successfully',
      chunks: finalChunks.length,
      storedChunks,
    });
  } catch (error) {
    console.error('Error processing knowledge:', error);
    
    // Update status to failed
    if (requestedFileId && authenticatedUserId) {
      try {
        const supabase = createSupabaseAdminClient();
        await supabase
          .from('agent_knowledge_files')
          .update({ status: 'failed' })
          .eq('id', requestedFileId)
          .eq('user_id', authenticatedUserId);
      } catch (statusError) {
        console.error('Failed to mark knowledge file as failed:', statusError);
      }
    }

    return sendError(res, error);
  }
}
