"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _express = require("express");
var _bcryptjs = _interopRequireDefault(require("bcryptjs"));
var _jsonwebtoken = _interopRequireDefault(require("jsonwebtoken"));
var _user = _interopRequireDefault(require("../models/user.js"));
var _chargebee = _interopRequireDefault(require("chargebee"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const router = (0, _express.Router)();

// Sign up route
router.post('/signup', async (req, res) => {
  const {
    name,
    email,
    password
  } = req.body;
  try {
    const existingUser = await _user.default.findOne({
      email
    });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists'
      });
    }
    const hashedPassword = await _bcryptjs.default.hash(password, 10);
    const newUser = new _user.default({
      name,
      email,
      password: hashedPassword,
      trialStartDate: new Date()
    });
    const user = await newUser.save();
    const token = _jsonwebtoken.default.sign({
      id: newUser._id
    }, process.env.JWT_SECRET, {
      expiresIn: '1d'
    });
    return res.status(201).json({
      success: true,
      message: 'User created successfully',
      token,
      user: {
        name: newUser.name,
        email: newUser.email,
        _id: user._id
      },
      isTrialExpired: newUser.isTrialExpired()
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});
router.post('/login', async (req, res) => {
  const {
    email,
    password
  } = req.body;
  try {
    const user = await _user.default.findOne({
      email
    });
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'User not found'
      });
    }
    const isMatch = await _bcryptjs.default.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    const token = _jsonwebtoken.default.sign({
      id: user._id
    }, process.env.JWT_SECRET, {
      expiresIn: '1d'
    });

    // Fetch customer ID from Chargebee
    const customerResponse = await _chargebee.default.customer.list({
      'email[is]': email
    }).request();
    let customerId = null;
    let ssoResponse = null;
    if (customerResponse.list.length) {
      customerId = customerResponse.list[0]?.customer?.id;
      ssoResponse = await _chargebee.default.portal_session.create({
        customer: {
          id: customerId,
          email: email
        }
      }).request();
    }
    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        name: user.name,
        email: user.email,
        _id: user._id
      },
      portalUrl: ssoResponse?.portal_session?.access_url,
      isTrialExpired: user.isTrialExpired()
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});
router.delete('/delete-account', async (req, res) => {
  const userId = req.body.id;
  try {
    const user = await _user.default.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Delete user from Chargebee
    const customerResponse = await _chargebee.default.customer.list({
      'email[is]': user.email
    }).request();
    if (customerResponse.list.length) {
      const customerId = customerResponse.list[0]?.customer?.id;
      await _chargebee.default.customer.delete(customerId).request();
    }

    // Delete user from database
    await _user.default.findByIdAndDelete(userId);
    return res.status(200).json({
      success: true,
      message: 'Account deleted successfully'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});
var _default = exports.default = router;
//# sourceMappingURL=user.js.map