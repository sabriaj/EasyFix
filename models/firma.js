import mongoose from "mongoose";

const FirmaSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  address: { type: String, required: true },
  category: { type: String, required: true },
  plan: { type: String, required: true }, // basic, standard, premium

  status: { type: String, default: "pending" }, 
  // pending = e regjistruar pa pagesë
  // active = pagesa e konfirmuar (webhook)
  // expired = abonimi ka skaduar

  created_at: { type: Date, default: Date.now }
});

export default mongoose.model("Firma", FirmaSchema);
