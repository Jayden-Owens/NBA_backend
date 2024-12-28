
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/user.js'; 

const router = Router();

// Sign up route
router.post("/signup", async (req, res) => {
    const { name, email, password } = req.body;
  
    try {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ success: false, message: "User already exists" });
      }
  
      const hashedPassword = await bcrypt.hash(password, 10);
  
      const newUser = new User({
        name,
        email,
        password: hashedPassword,
        trialStartDate: new Date(),
      });
  
      const user = await newUser.save();
      console.log(user)
  
      const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, {
        expiresIn: "1d",
      });
  
      return res.status(201).json({
        success: true, message: "User created successfully",
        token,
        user: {
          name: newUser.name,
          email: newUser.email,
          _id: user._id
        },
        isTrialExpired: newUser.isTrialExpired(),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });

router.post("/login", async (req, res) => {
    const { email, password } = req.body;
  
    try {
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(400).json({ success: false, message: "User not found" });
      }
  
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ success: false, message: "Invalid credentials" });
      }

      if (user.isTrialExpired()) {
        return res.status(403).json({success: false, message: "Your trial has expired. Please upgrade your plan."});
      }
    
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
        expiresIn: "1d",
      });
  
      res.status(200).json({
        success: true, message: "Login successful",
        token,
        user: {
          name: user.name,
          email: user.email,
          _id: user._id
        },
        isTrialExpired: user.isTrialExpired(),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });


  export default router;
