import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogIn, User, Lock, Eye, EyeOff } from 'lucide-react';
import logoImage from '../assets/logo.jpg';

const Auth = () => {
  const [mode, setMode] = useState('login'); // 'login', 'forgot', 'change'
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    newPassword: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const { login, resetPassword, changePassword } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (mode === 'login') {
        await login(formData.username, formData.password);
        navigate('/');
      } else if (mode === 'forgot') {
        await resetPassword(formData.username);
        setSuccess(`Password reset link sent to ${formData.username === 'balajilodge' || formData.username === 'pramod' || formData.username === 'balaji' ? 'balajilodgingpandharpur@gmail.com' : 'your registered email'}. Please check your Inbox and Spam folder. NOTE: If you have never logged in, the account may not exist yet.`);
        setTimeout(() => setMode('login'), 8000);
      } else if (mode === 'change') {
        await changePassword(formData.username, formData.password, formData.newPassword);
        setSuccess('Password changed successfully. Please login with new password.');
        setFormData({ ...formData, password: '', newPassword: '' });
        setTimeout(() => setMode('login'), 2000);
      }
    } catch (err) {
      console.error(err);
      if (mode === 'login') {
         if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
            setError('Invalid username or password.');
         } else {
            setError('Failed to sign in. Please try again.');
         }
      } else if (mode === 'forgot') {
         setError('Failed to send reset link. Check username.');
      } else if (mode === 'change') {
         setError('Failed to change password. Check old password.');
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-900 flex items-center justify-center p-4">
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 p-8 rounded-3xl shadow-2xl w-full max-w-md animate-fade-in-up transition-all duration-300">
        <div className="text-center mb-8">
            <div className="bg-white p-2 rounded-2xl w-24 h-24 mx-auto mb-4 flex items-center justify-center shadow-lg">
                <img src={logoImage} alt="Logo" className="w-full h-full object-contain rounded-xl" />
            </div>
            <h2 className="text-3xl font-black text-white tracking-tight">
                {mode === 'login' ? 'Balaji Lodge' : mode === 'forgot' ? 'Reset Password' : 'Change Password'}
            </h2>
            <p className="text-indigo-200 mt-2 text-sm">
                {mode === 'login' ? 'Sign in to manage your lodge' : mode === 'forgot' ? 'Enter username to receive reset link' : 'Update your security credentials'}
            </p>
        </div>

        {error && <div className="bg-red-500/20 border border-red-500/50 text-red-100 p-3 rounded-xl mb-6 text-sm text-center animate-pulse">{error}</div>}
        {success && <div className="bg-green-500/20 border border-green-500/50 text-green-100 p-3 rounded-xl mb-6 text-sm text-center animate-pulse">{success}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-300" size={20} />
              <input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleChange}
                placeholder="Username"
                className="w-full bg-indigo-950/50 text-white placeholder-indigo-400 pl-12 pr-4 py-3.5 rounded-xl border border-indigo-500/30 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none transition-all font-medium"
                required
              />
            </div>
          </div>

          {mode !== 'forgot' && (
            <div>
                <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-300" size={20} />
                <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder={mode === 'change' ? "Old Password" : "Password"}
                    className="w-full bg-indigo-950/50 text-white placeholder-indigo-400 pl-12 pr-12 py-3.5 rounded-xl border border-indigo-500/30 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none transition-all font-medium"
                    required
                />
                <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-indigo-300 hover:text-indigo-100 transition-colors focus:outline-none"
                >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
                </div>
            </div>
          )}

          {mode === 'change' && (
            <div>
                <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-300" size={20} />
                <input
                    type={showPassword ? "text" : "password"}
                    name="newPassword"
                    value={formData.newPassword}
                    onChange={handleChange}
                    placeholder="New Password"
                    className="w-full bg-indigo-950/50 text-white placeholder-indigo-400 pl-12 pr-12 py-3.5 rounded-xl border border-indigo-500/30 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none transition-all font-medium"
                    required
                />
                </div>
            </div>
          )}
          
          <button
            type="submit"
            disabled={loading}
            className={`w-full mt-4 font-bold py-4 rounded-xl shadow-lg transform transition-all active:scale-[0.98] flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 shadow-indigo-500/30 text-white`}
          >
            {loading 
                ? 'Please wait...' 
                : <><LogIn size={20} /> {mode === 'login' ? 'Sign In' : mode === 'forgot' ? 'Send Reset Link' : 'Update Password'}</> 
            }
          </button>
        </form>

        <div className="mt-6 flex flex-col items-center gap-2 text-sm">
            {mode === 'login' && (
                <>
                    <button onClick={() => setMode('forgot')} className="text-indigo-200 hover:text-white transition-colors">
                        Forgot Password?
                    </button>
                    <button onClick={() => setMode('change')} className="text-indigo-200 hover:text-white transition-colors">
                        Change Password
                    </button>
                </>
            )}
            {mode !== 'login' && (
                <button onClick={() => setMode('login')} className="text-indigo-200 hover:text-white transition-colors font-bold">
                    Back to Login
                </button>
            )}
        </div>
      </div>
    </div>
  );
};

export default Auth;