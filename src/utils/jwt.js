import jwt from 'jsonwebtoken';

export const signAccessToken = (payload) => {
  const secret = process.env.JWT_SECRET || 'fallback_secret_key_change_me';
  const expiresIn = process.env.JWT_EXPIRES_IN || '1h';
  return jwt.sign(payload, secret, { expiresIn });
};

export const signRefreshToken = (payload) => {
  const secret = process.env.JWT_REFRESH_SECRET || 'fallback_refresh_key_change_me';
  const expiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
  return jwt.sign(payload, secret, { expiresIn });
};

export const verifyAccessToken = (token) => {
  const secret = process.env.JWT_SECRET || 'fallback_secret_key_change_me';
  return jwt.verify(token, secret);
};

export const verifyRefreshToken = (token) => {
  const secret = process.env.JWT_REFRESH_SECRET || 'fallback_refresh_key_change_me';
  return jwt.verify(token, secret);
};
