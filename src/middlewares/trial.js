import User from "../models/user.js";

export const checkTrialExpiration = async (req, res, next) => {
  const userId = req.user.id;

  try {
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).send("User not found");
    }
    if(user.isSubscribed === false) {
      
      const now = new Date();
      const trialStartDate = new Date(user.trialStartDate);
      
      const trialEndDate = new Date(trialStartDate);
      trialEndDate.setUTCDate(trialEndDate.getUTCDate() + (user.trialExpired ? 30 : 7));
      
      const remainingTime = trialEndDate - now;
      
      const remainingDays = Math.max(Math.ceil(remainingTime / (1000 * 3600 * 24)), 0);
      
      res.locals.remainingTrialDays = remainingDays;
    }
    res.locals.subscribed = user.isSubscribed;

    next();

  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: error.message });
  }
};