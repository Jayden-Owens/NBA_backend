"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _mongoose = _interopRequireDefault(require("mongoose"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const latestStatsDateSchema = new _mongoose.default.Schema({
  Date: {
    type: Date,
    default: () => Date.now()
  }
}, {
  timestamps: true
});
const LatestStatsDate = _mongoose.default.model('LatestStatsDate', latestStatsDateSchema);
var _default = exports.default = LatestStatsDate;
//# sourceMappingURL=StatsDate.js.map