import jwt from 'jsonwebtoken';
import User from '../models/user';

export const isAuthenticatedUser = async (req, res, next) => {
  try {
    const token =
      req.cookies?.token || req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ success: false, message: 'Unauthorized Access' });
    }

    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decodedToken?.id).select('-password');

    console.log

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid Token' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid Token' });
  }
};