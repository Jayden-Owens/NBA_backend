"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.isAuthenticatedUser = void 0;
var _jsonwebtoken = _interopRequireDefault(require("jsonwebtoken"));
var _user = _interopRequireDefault(require("../models/user"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const isAuthenticatedUser = async (req, res, next) => {
  try {
    const token = req.cookies?.token || req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized Access'
      });
    }
    const decodedToken = _jsonwebtoken.default.verify(token, process.env.JWT_SECRET);
    const user = await _user.default.findById(decodedToken?.id).select('-password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid Token'
      });
    }
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid Token'
    });
  }
};
exports.isAuthenticatedUser = isAuthenticatedUser;
//# sourceMappingURL=auth.js.map