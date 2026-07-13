import { workflow, node, trigger, switchCase, sticky, newCredential, expr } from '@n8n/workflow-sdk';

const calledByPandora = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.2,
  config: {
    name: 'When Called by Pandora',
    parameters: {
      inputSource: 'workflowInputs',
      workflowInputs: {
        values: [
          { name: 'organizationId', type: 'string' },
          { name: 'operation', type: 'string' },
          { name: 'params', type: 'object' },
          { name: 'approvalId', type: 'string' },
          { name: 'idempotencyKey', type: 'string' },
          { name: 'correlationId', type: 'string' },
        ],
      },
    },
  },
  output: [{
    organizationId: '11111111-1111-4111-8111-111111111111',
    operation: 'calendar.freebusy',
    params: {
      calendarId: 'primary',
      timeMin: '2026-07-14T13:00:00+01:00',
      timeMax: '2026-07-14T13:30:00+01:00',
      timeZone: 'Africa/Lagos',
    },
    approvalId: '',
    idempotencyKey: 'fixture:calendar-freebusy:1',
    correlationId: '22222222-2222-4222-8222-222222222222',
  }],
});

const allowListedOperation = switchCase({
  version: 3.4,
  config: {
    name: 'Allow-listed Google Operation',
    parameters: {
      mode: 'rules',
      rules: {
        values: [
          { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $("When Called by Pandora").item.json.operation }}'), rightValue: 'gmail.search', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, renameOutput: true, outputKey: 'gmail.search' },
          { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $("When Called by Pandora").item.json.operation }}'), rightValue: 'gmail.read', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, renameOutput: true, outputKey: 'gmail.read' },
          { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $("When Called by Pandora").item.json.operation }}'), rightValue: 'gmail.draft', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, renameOutput: true, outputKey: 'gmail.draft' },
          { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $("When Called by Pandora").item.json.operation }}'), rightValue: 'calendar.list', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, renameOutput: true, outputKey: 'calendar.list' },
          { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $("When Called by Pandora").item.json.operation }}'), rightValue: 'calendar.freebusy', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, renameOutput: true, outputKey: 'calendar.freebusy' },
          { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $("When Called by Pandora").item.json.operation }}'), rightValue: 'gmail.send', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, renameOutput: true, outputKey: 'gmail.send' },
          { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $("When Called by Pandora").item.json.operation }}'), rightValue: 'gmail.trash', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, renameOutput: true, outputKey: 'gmail.trash' },
          { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $("When Called by Pandora").item.json.operation }}'), rightValue: 'calendar.create', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, renameOutput: true, outputKey: 'calendar.create' },
          { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $("When Called by Pandora").item.json.operation }}'), rightValue: 'calendar.update', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, renameOutput: true, outputKey: 'calendar.update' },
          { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $("When Called by Pandora").item.json.operation }}'), rightValue: 'calendar.delete', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, renameOutput: true, outputKey: 'calendar.delete' },
        ],
      },
      options: {
        fallbackOutput: 'extra',
        renameFallbackOutput: 'Invalid operation',
        ignoreCase: false,
      },
    },
  },
  output: [{ operation: 'calendar.freebusy' }],
});

const brokerCredential = newCredential('Pandora Connector Broker');
const brokerBody = expr('{{ { organizationId: $("When Called by Pandora").item.json.organizationId, operation: $("When Called by Pandora").item.json.operation, params: $("When Called by Pandora").item.json.params, approvalId: $("When Called by Pandora").item.json.approvalId || null, idempotencyKey: $("When Called by Pandora").item.json.idempotencyKey } }}');

const callReadBroker = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Call Connector Broker (read)',
    parameters: {
      method: 'POST',
      url: 'https://vviyheojbgeijhelaxmw.supabase.co/functions/v1/connector-broker',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: { parameters: [{ name: 'X-Correlation-Id', value: expr('{{ $("When Called by Pandora").item.json.correlationId }}') }] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: brokerBody,
      options: { timeout: 15000, response: { response: { responseFormat: 'json' } } },
    },
    credentials: { httpHeaderAuth: brokerCredential },
    onError: 'continueErrorOutput',
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 5000,
  },
  output: [{ ok: true, result: { calendars: {} }, duplicate: false }],
});

const callMutationBroker = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Call Connector Broker (mutation)',
    parameters: {
      method: 'POST',
      url: 'https://vviyheojbgeijhelaxmw.supabase.co/functions/v1/connector-broker',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: { parameters: [{ name: 'X-Correlation-Id', value: expr('{{ $("When Called by Pandora").item.json.correlationId }}') }] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: brokerBody,
      options: { timeout: 15000, response: { response: { responseFormat: 'json' } } },
    },
    credentials: { httpHeaderAuth: brokerCredential },
    onError: 'continueErrorOutput',
  },
  output: [{ ok: true, result: { id: 'provider-id' }, duplicate: false }],
});

const returnReadResult = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: { name: 'Return Read Result', parameters: { mode: 'manual', assignments: { assignments: [
    { id: 'success', name: 'success', type: 'boolean', value: expr('{{ true }}') },
    { id: 'operation', name: 'operation', type: 'string', value: expr('{{ $("When Called by Pandora").item.json.operation }}') },
    { id: 'result', name: 'result', type: 'object', value: expr('{{ $("Call Connector Broker (read)").item.json.result ?? {} }}') },
    { id: 'duplicate', name: 'duplicate', type: 'boolean', value: expr('{{ $("Call Connector Broker (read)").item.json.duplicate ?? false }}') },
  ] }, includeOtherFields: false } },
  output: [{ success: true, operation: 'calendar.freebusy', result: { calendars: {} }, duplicate: false }],
});

const returnMutationResult = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: { name: 'Return Mutation Result', parameters: { mode: 'manual', assignments: { assignments: [
    { id: 'success', name: 'success', type: 'boolean', value: expr('{{ true }}') },
    { id: 'operation', name: 'operation', type: 'string', value: expr('{{ $("When Called by Pandora").item.json.operation }}') },
    { id: 'result', name: 'result', type: 'object', value: expr('{{ $("Call Connector Broker (mutation)").item.json.result ?? {} }}') },
    { id: 'duplicate', name: 'duplicate', type: 'boolean', value: expr('{{ $("Call Connector Broker (mutation)").item.json.duplicate ?? false }}') },
  ] }, includeOtherFields: false } },
  output: [{ success: true, operation: 'calendar.create', result: { id: 'provider-id' }, duplicate: false }],
});

const returnReadError = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: { name: 'Return Read Error', parameters: { mode: 'manual', assignments: { assignments: [
    { id: 'success', name: 'success', type: 'boolean', value: expr('{{ false }}') },
    { id: 'error', name: 'error', type: 'string', value: 'upstream_error' },
    { id: 'message', name: 'message', type: 'string', value: 'The connector broker could not complete this read.' },
    { id: 'retryable', name: 'retryable', type: 'boolean', value: expr('{{ true }}') },
  ] }, includeOtherFields: false } },
  output: [{ success: false, error: 'upstream_error', message: 'The connector broker could not complete this read.', retryable: true }],
});

const returnMutationError = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: { name: 'Return Mutation Error', parameters: { mode: 'manual', assignments: { assignments: [
    { id: 'success', name: 'success', type: 'boolean', value: expr('{{ false }}') },
    { id: 'error', name: 'error', type: 'string', value: 'needs_reconciliation' },
    { id: 'message', name: 'message', type: 'string', value: 'The mutation result is uncertain and must not be retried automatically.' },
    { id: 'retryable', name: 'retryable', type: 'boolean', value: expr('{{ false }}') },
  ] }, includeOtherFields: false } },
  output: [{ success: false, error: 'needs_reconciliation', message: 'The mutation result is uncertain and must not be retried automatically.', retryable: false }],
});

const returnInvalidOperation = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: { name: 'Return Invalid Operation', parameters: { mode: 'manual', assignments: { assignments: [
    { id: 'success', name: 'success', type: 'boolean', value: expr('{{ false }}') },
    { id: 'error', name: 'error', type: 'string', value: 'invalid_operation' },
    { id: 'message', name: 'message', type: 'string', value: 'This Google operation is not allowed.' },
    { id: 'retryable', name: 'retryable', type: 'boolean', value: expr('{{ false }}') },
  ] }, includeOtherFields: false } },
  output: [{ success: false, error: 'invalid_operation', message: 'This Google operation is not allowed.', retryable: false }],
});

const contractNote = sticky('### Trusted connector boundary\nOne shared workflow serves every organization. The fixed broker resolves Supabase Vault credentials; n8n never receives a customer OAuth token.', [calledByPandora, allowListedOperation], { color: 5 });
const safetyNote = sticky('### Retry boundary\nRead calls use bounded retries. Mutations do not retry automatically because a timeout after a provider write is ambiguous and requires reconciliation.', [callReadBroker, callMutationBroker], { color: 3 });

export default workflow('pandora-google-workspace-action', 'Pandora — Google Workspace Action')
  .add(calledByPandora)
  .to(allowListedOperation
    .onCase(0, callReadBroker)
    .onCase(1, callReadBroker)
    .onCase(2, callReadBroker)
    .onCase(3, callReadBroker)
    .onCase(4, callReadBroker)
    .onCase(5, callMutationBroker)
    .onCase(6, callMutationBroker)
    .onCase(7, callMutationBroker)
    .onCase(8, callMutationBroker)
    .onCase(9, callMutationBroker)
    .onCase(10, returnInvalidOperation))
  .add(callReadBroker)
  .to(returnReadResult)
  .add(callReadBroker.onError(returnReadError))
  .add(callMutationBroker)
  .to(returnMutationResult)
  .add(callMutationBroker.onError(returnMutationError))
  .add(contractNote)
  .add(safetyNote);
