import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { UserPlus, Mail, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button, Input, PlaceholderLogo } from '@/components/ui';

export default function SignUpPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmationSent, setConfirmationSent] = useState(false);
  const { signUp, signInWithGoogle, user, loading: authLoading } = useAuth();

  // Redirect if already authenticated
  if (!authLoading && user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    const { error } = await signUp(email, password, fullName.trim());
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setConfirmationSent(true);
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    await signInWithGoogle();
  };

  return (
    <div className="min-h-screen flex bg-black">
      {/* Left Form Side */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-8 sm:px-16 py-12 relative z-10 bg-[#050505]">
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7 }}
          className="w-full max-w-md"
        >
          {/* Logo */}
          <div className="mb-10">
            <Link to="/" className="inline-block group">
              <PlaceholderLogo size={48} className="group-hover:opacity-80 transition-opacity" />
            </Link>
            {!confirmationSent && (
              <>
                <h1 className="text-3xl font-thin text-white mt-8 mb-2 uppercase tracking-tight">Create <span className="font-medium">Account</span></h1>
                <p className="text-sm text-gray-400 font-light">Join Pandora Labs and automate your ops</p>
              </>
            )}
          </div>

          {/* Form */}
          <div className="space-y-6">
            {confirmationSent ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-8"
              >
                <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                  <Mail className="text-white" size={32} />
                </div>
                <h3 className="text-2xl font-thin text-white mb-3 uppercase tracking-tight">
                  Check Your <span className="font-medium">Email</span>
                </h3>
                <p className="text-sm text-gray-400 font-light max-w-sm mx-auto mb-2">
                  We've sent a confirmation link to
                </p>
                <p className="text-sm text-white font-medium mb-6">{email}</p>
                <p className="text-xs text-gray-500 font-light max-w-xs mx-auto mb-8">
                  Click the link in the email to verify your account and access your dashboard. Check your spam folder if you don't see it.
                </p>
                <div className="flex flex-col gap-3">
                  <Link to="/login">
                    <Button variant="primary" size="md" className="w-full uppercase tracking-widest text-xs">
                      <ArrowLeft size={14} />
                      Go to Sign In
                    </Button>
                  </Link>
                  <button
                    onClick={() => {
                      setConfirmationSent(false);
                      setEmail('');
                      setPassword('');
                      setFullName('');
                    }}
                    className="text-xs text-gray-500 hover:text-white transition-colors cursor-pointer"
                  >
                    Use a different email
                  </button>
                </div>
              </motion.div>
            ) : (
              <>
                <button
                  onClick={handleGoogleSignIn}
                  className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-full bg-[#111] border border-white/10 text-white text-sm font-medium hover:bg-[#1a1a1a] hover:border-white/30 transition-all duration-300 cursor-pointer"
                >
                  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Sign up with Google
                </button>

                <div className="flex items-center gap-4">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-xs text-gray-500 uppercase tracking-wider">or email</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <Input
                    label="Full Name"
                    type="text"
                    placeholder="Your name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                  <Input
                    label="Email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <Input
                    label="Password"
                    type="password"
                    placeholder="Min. 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />

                  {error && (
                    <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">
                      {error}
                    </div>
                  )}

                  <Button type="submit" variant="primary" size="lg" className="w-full mt-2 uppercase tracking-widest text-xs" loading={loading}>
                    <UserPlus size={16} />
                    Create Account
                  </Button>
                </form>

                <p className="text-xs text-gray-500 text-center font-light pt-2">
                  By signing up, you agree to our Terms and Privacy Policy.
                </p>
              </>
            )}

            {!confirmationSent && (
              <p className="text-center text-sm text-gray-500 pt-6 border-t border-white/5">
                Already have an account?{' '}
                <Link to="/login" className="text-white hover:text-gray-300 font-medium transition-colors border-b border-white/30 hover:border-white pb-0.5">
                  Sign in
                </Link>
              </p>
            )}
          </div>
        </motion.div>
      </div>

      {/* Right Image Side */}
      <div className="hidden lg:block lg:w-1/2 relative bg-black">
        <div className="absolute inset-0 bg-gradient-to-r from-[#050505] via-transparent to-transparent z-10" />
        <img 
          src="/images/dashboard_banner.png" 
          alt="Pandora AI"
          className="absolute inset-0 w-full h-full object-cover object-center mix-blend-lighten grayscale opacity-80"
        />
      </div>
    </div>
  );
}
