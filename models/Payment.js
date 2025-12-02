import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
  email: String,
  order_id: Number,
  variant_id: Number,
  plan: String,
  status: String,
  created_at: { type: Date, default: Date.now }
});

export default mongoose.model("Payment", paymentSchema);
