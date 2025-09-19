# SecureWipe Authentication Setup

## Overview
I've added a complete authentication system to SecureWipe with login/signup functionality and Google OAuth integration.

## Features Added

### 🔐 Authentication Pages
- **Login/Signup Page** (`/auth.html`) - Modern, responsive design matching the site theme
- **User Dashboard** (`/dashboard.html`) - Personalized dashboard with user stats and activity
- **Navigation Integration** - "Sign In" link added to main navigation

### 🛠️ Backend API
- **User Registration** - `/api/auth/signup`
- **User Login** - `/api/auth/login`
- **Google OAuth** - `/api/auth/google`
- **User Stats** - `/api/user/stats`
- **Password Reset** - `/api/auth/forgot-password`

### 🎨 Design Features
- **Consistent Styling** - Matches the main site's dark theme and gradient accents
- **Responsive Design** - Works on desktop and mobile devices
- **Smooth Animations** - Professional transitions and hover effects
- **Form Validation** - Client-side and server-side validation
- **Loading States** - Visual feedback during authentication

## Setup Instructions

### 1. Install Dependencies
```bash
cd server
npm install
```

### 2. Environment Variables
Add to your `.env` file:
```env
JWT_SECRET=your-super-secret-jwt-key-change-in-production
GOOGLE_CLIENT_ID=your-google-oauth-client-id
```

### 3. Google OAuth Setup
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URIs:
   - `http://localhost:8080/auth.html` (development)
   - `https://yourdomain.com/auth.html` (production)
6. Copy the Client ID and update the auth.html file

### 4. Update Google Client ID
In `public/auth.html`, replace `YOUR_GOOGLE_CLIENT_ID` with your actual Google Client ID:
```javascript
client_id: 'YOUR_GOOGLE_CLIENT_ID', // Replace with actual client ID
```

## API Endpoints

### Authentication
- `POST /api/auth/signup` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/google` - Google OAuth login/signup
- `POST /api/auth/forgot-password` - Password reset request

### User Data
- `GET /api/user/stats` - Get user statistics (requires authentication)

## Security Features

### 🔒 Password Security
- **bcrypt Hashing** - Passwords are hashed with bcrypt (12 rounds)
- **Minimum Length** - 8 character minimum password requirement
- **Input Validation** - Server-side validation for all inputs

### 🎫 JWT Tokens
- **7-day Expiration** - Tokens expire after 7 days
- **Secure Storage** - Tokens stored in localStorage
- **Automatic Refresh** - Users need to re-login after token expiration

### 🛡️ Google OAuth
- **Secure Integration** - Uses Google's official OAuth 2.0 flow
- **Profile Data** - Safely retrieves user name, email, and profile picture
- **Account Linking** - Links Google accounts with existing users

## User Experience

### 📱 Responsive Design
- **Mobile-First** - Optimized for mobile devices
- **Touch-Friendly** - Large buttons and touch targets
- **Smooth Scrolling** - Consistent with main site experience

### 🎨 Visual Design
- **Dark Theme** - Matches SecureWipe's aesthetic
- **Gradient Accents** - Blue to purple gradients throughout
- **Loading States** - Spinner animations during authentication
- **Error Handling** - Clear error messages and validation feedback

### 🔄 State Management
- **Persistent Login** - Users stay logged in across browser sessions
- **Auto-Redirect** - Logged-in users are redirected to dashboard
- **Session Validation** - Automatic token validation on page load

## File Structure

```
public/
├── auth.html          # Authentication page
├── dashboard.html     # User dashboard
└── ...

server/
├── index.js          # Main server with auth routes
├── package.json      # Updated with new dependencies
└── ...

src/
├── App.jsx           # Updated with auth navigation
└── App.css           # Updated with auth link styling
```

## Next Steps

### 🚀 Production Deployment
1. **Database Integration** - Replace in-memory storage with PostgreSQL/MongoDB
2. **Email Service** - Implement actual password reset emails
3. **Rate Limiting** - Add rate limiting to prevent brute force attacks
4. **HTTPS** - Ensure all authentication happens over HTTPS
5. **Environment Security** - Use proper secret management

### 🔧 Additional Features
1. **Two-Factor Authentication** - Add 2FA support
2. **Social Logins** - Add Facebook, Twitter, GitHub login
3. **User Profiles** - Allow users to update their profiles
4. **Activity Logs** - Track user authentication events
5. **Admin Panel** - User management interface

## Testing

### Manual Testing
1. **Registration** - Test user signup with valid/invalid data
2. **Login** - Test user login with correct/incorrect credentials
3. **Google OAuth** - Test Google sign-in flow
4. **Dashboard** - Verify dashboard loads with user data
5. **Logout** - Test logout functionality
6. **Session Persistence** - Test login persistence across page refreshes

### API Testing
Use tools like Postman or curl to test the API endpoints:

```bash
# Test signup
curl -X POST http://localhost:8080/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"password123"}'

# Test login
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

The authentication system is now fully integrated and ready for use! Users can sign up, log in, and access their personalized dashboard while maintaining the beautiful design and user experience of the main SecureWipe site.
