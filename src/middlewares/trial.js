import User from "../models/user";

export const checkTrialExpiration = async (req, res, next) => {
  const userId = req.user.id;

  try {
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).send("User not found");
    }

    const now = new Date();
    const trialEndDate = new Date(user.trialStartDate);
    trialEndDate.setDate(trialEndDate.getDate() + 7);

    const remainingTime = trialEndDate - now;
    const remainingDays = Math.max(Math.ceil(remainingTime / (1000 * 3600 * 24)), 0);

    res.locals.remainingTrialDays = remainingDays;

    next();

  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: error.message });
  }
};