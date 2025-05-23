import mongoose from 'mongoose';

const lastSchema = new mongoose.Schema({
    StatID: { type: Number },
    TeamID: { type: Number },
    PlayerID: { type: Number },
    SeasonType: { type: Number },
    Season: { type: Number },
    Name: { type: String },
    Team: { type: String },
    Position: { type: String },
    Started: { type: Number },
    Games: { type: Number },
    FantasyPoints: { type: Number },
    Minutes: { type: Number },
    Seconds: { type: Number },
    FieldGoalsMade: { type: Number },
    FieldGoalsAttempted: { type: Number },
    FieldGoalsPercentage: { type: Number },
    TwoPointersMade: { type: Number },
    TwoPointersAttempted: { type: Number },
    TwoPointersPercentage: { type: Number },
    ThreePointersMade: { type: Number },
    ThreePointersAttempted: { type: Number },
    ThreePointersPercentage: { type: Number },
    FreeThrowsMade: { type: Number },
    FreeThrowsAttempted: { type: Number },
    FreeThrowsPercentage: { type: Number },
    OffensiveRebounds: { type: Number },
    DefensiveRebounds: { type: Number },
    Rebounds: { type: Number },
    Assists: { type: Number },
    Steals: { type: Number },
    BlockedShots: { type: Number },
    Turnovers: { type: Number },
    PersonalFouls: { type: Number },
    Points: { type: Number },
    FantasyPointsFanDuel: { type: Number },
    FantasyPointsDraftKings: { type: Number },
    PlusMinus: { type: Number },
    DoubleDoubles: { type: Number },
    TripleDoubles: { type: Number },
});

const Last = mongoose.model('Last', lastSchema);

export default Last;