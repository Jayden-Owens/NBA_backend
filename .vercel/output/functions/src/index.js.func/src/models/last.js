"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _mongoose = _interopRequireDefault(require("mongoose"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const lastSchema = new _mongoose.default.Schema({
  StatID: {
    type: Number
  },
  TeamID: {
    type: Number
  },
  PlayerID: {
    type: Number
  },
  SeasonType: {
    type: Number
  },
  Season: {
    type: Number
  },
  Name: {
    type: String
  },
  Team: {
    type: String
  },
  Position: {
    type: String
  },
  Started: {
    type: Number
  },
  Games: {
    type: Number
  },
  FantasyPoints: {
    type: Number
  },
  Minutes: {
    type: Number
  },
  Seconds: {
    type: Number
  },
  FieldGoalsMade: {
    type: Number
  },
  FieldGoalsAttempted: {
    type: Number
  },
  FieldGoalsPercentage: {
    type: Number
  },
  TwoPointersMade: {
    type: Number
  },
  TwoPointersAttempted: {
    type: Number
  },
  TwoPointersPercentage: {
    type: Number
  },
  ThreePointersMade: {
    type: Number
  },
  ThreePointersAttempted: {
    type: Number
  },
  ThreePointersPercentage: {
    type: Number
  },
  FreeThrowsMade: {
    type: Number
  },
  FreeThrowsAttempted: {
    type: Number
  },
  FreeThrowsPercentage: {
    type: Number
  },
  OffensiveRebounds: {
    type: Number
  },
  DefensiveRebounds: {
    type: Number
  },
  Rebounds: {
    type: Number
  },
  Assists: {
    type: Number
  },
  Steals: {
    type: Number
  },
  BlockedShots: {
    type: Number
  },
  Turnovers: {
    type: Number
  },
  PersonalFouls: {
    type: Number
  },
  Points: {
    type: Number
  },
  FantasyPointsFanDuel: {
    type: Number
  },
  FantasyPointsDraftKings: {
    type: Number
  },
  PlusMinus: {
    type: Number
  },
  DoubleDoubles: {
    type: Number
  },
  TripleDoubles: {
    type: Number
  }
});
const Last = _mongoose.default.model('Last', lastSchema);
var _default = exports.default = Last;
//# sourceMappingURL=last.js.map