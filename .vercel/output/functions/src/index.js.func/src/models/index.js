"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.connectDb = void 0;
var _mongoose = _interopRequireDefault(require("mongoose"));
var _player = _interopRequireDefault(require("./player"));
var _current = _interopRequireDefault(require("./current"));
var _last = _interopRequireDefault(require("./last"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const connectDb = () => {
  return _mongoose.default.connect(process.env.DATABASE_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
};
exports.connectDb = connectDb;
const models = {
  Player: _player.default,
  Last: _last.default,
  Current: _current.default
};
var _default = exports.default = models;
//# sourceMappingURL=index.js.map