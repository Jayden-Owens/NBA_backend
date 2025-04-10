"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.checkTrialExpiration = void 0;
var _user = _interopRequireDefault(require("../models/user"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const checkTrialExpiration = async (req, res, next) => {
  const userId = req.user.id;
  try {
    const user = await _user.default.findById(userId);
    if (!user) {
      return res.status(404).send("User not found");
    }
    const now = new Date();
    const trialStartDate = new Date(user.trialStartDate);
    const trialEndDate = new Date(trialStartDate);
    trialEndDate.setUTCDate(trialEndDate.getUTCDate() + (user.trialExpired ? 30 : 7));
    const remainingTime = trialEndDate - now;
    const remainingDays = Math.max(Math.ceil(remainingTime / (1000 * 3600 * 24)), 0);
    res.locals.remainingTrialDays = remainingDays;
    next();
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
exports.checkTrialExpiration = checkTrialExpiration;
//# sourceMappingURL=trial.js.map