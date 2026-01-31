
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogIn, UserPlus, User, Lock, Phone, Building2 } from 'lucide-react';
import logoImage from '../assets/logo.jpg';

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    mobile: '',
    lodgeName: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login, signup } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!isLogin && formData.password.length < 6) {
        return setError('Password must be at least 6 characters long');
    }

    try {
      setLoading(true);
      if (isLogin) {
        await login(formData.username, formData.password);
      } else {
        await signup(formData.username, formData.password, formData.mobile, formData.lodgeName);
      }
      navigate('/');
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
         setError('This username is already taken.');
      } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
         setError('Invalid username or password.');
      } else {
         setError(`Failed to ${isLogin ? 'sign in' : 'create account'}. Please try again.`);
      }
    }
    setLoading(false);
  };

  const toggleMode = () => {
      setIsLogin(!isLogin);
      setError('');
      setFormData({ username: '', password: '', mobile: '', lodgeName: '' });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-900 flex items-center justify-center p-4">
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 p-8 rounded-3xl shadow-2xl w-full max-w-md animate-fade-in-up transition-all duration-300">
        <div className="text-center mb-8">
            <div className="bg-white p-2 rounded-2xl w-24 h-24 mx-auto mb-4 flex items-center justify-center shadow-lg">
                <img src={logoImage} alt="Logo" className="w-full h-full object-contain rounded-xl" />
            </div>
            <h2 className="text-3xl font-black text-white tracking-tight">
                {isLogin ? 'Welcome Back' : 'Create Account'}
            </h2>
            <p className="text-indigo-200 mt-2 text-sm">
                {isLogin ? 'Sign in to manage your lodge' : 'Set up your administration account'}
            </p>
        </div>

        {error && <div className="bg-red-500/20 border border-red-500/50 text-red-100 p-3 rounded-xl mb-6 text-sm text-center animate-pulse">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {!isLogin && (
            <>
                <div className="animate-fade-in">
                    <div className="relative">
                    <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-300" size={20} />
                    <input
                        type="text"
                        name="lodgeName"
                        value={formData.lodgeName}
                        onChange={handleChange}
                        placeholder="Lodge Name"
                        className="w-full bg-indigo-950/50 text-white placeholder-indigo-400 pl-12 pr-4 py-3.5 rounded-xl border border-indigo-500/30 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none transition-all font-medium"
                        required={!isLogin}
                    />
                    </div>
                </div>

                <div className="animate-fade-in">
                    <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-300" size={20} />
                    <input
                        type="tel"
                        name="mobile"
                        value={formData.mobile}
                        onChange={handleChange}
                        placeholder="Mobile Number"
                        className="w-full bg-indigo-950/50 text-white placeholder-indigo-400 pl-12 pr-4 py-3.5 rounded-xl border border-indigo-500/30 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none transition-all font-medium"
                        required={!isLogin}
                    />
                    </div>
                </div>
            </>
          )}

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

          <div>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-300" size={20} />
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Password"
                className="w-full bg-indigo-950/50 text-white placeholder-indigo-400 pl-12 pr-4 py-3.5 rounded-xl border border-indigo-500/30 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none transition-all font-medium"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full mt-4 font-bold py-4 rounded-xl shadow-lg transform transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${
                isLogin 
                ? 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 shadow-indigo-500/30' 
                : 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-emerald-500/30'
            } text-white`}
          >
            {loading 
                ? 'Please wait...' 
                : isLogin 
                    ? <><LogIn size={20} /> Sign In</> 
                    : <><UserPlus size={20} /> Create Account</>
            }
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-indigo-200 text-sm">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button 
                onClick={toggleMode} 
                className="text-white font-bold hover:text-indigo-300 transition-colors underline decoration-2 decoration-indigo-500/50 hover:decoration-indigo-300 focus:outline-none"
            >
              {isLogin ? 'Create User' : 'Sign In'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
