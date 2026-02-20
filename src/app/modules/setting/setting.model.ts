import mongoose, { Schema, Document } from "mongoose";

// Interface for Settings
export interface ISettings extends Document {
  content: string;
  key:
    | "mrpRepairWaiver"
    | "repairLiability"
    | "warrentyCoverage"
    | "customerResponsibilities"
    | "pricing"
    | "importantNotice"
    | "privacyPolicy"
    | "aboutUs"
    | "termsService";
}

// Settings Schema
const settingsSchema = new Schema<ISettings>(
  {
    content: {
      type: String,
      required: true,
    },
    key: {
      type: String,
      enum: [
        "mrpRepairWaiver",
        "repairLiability",
        "warrentyCoverage",
        "customerResponsibilities",
        "pricing",
        "importantNotice",
        "privacyPolicy",
        "aboutUs",
        "termsService",
      ],
      required: true,
    },
  },
  { timestamps: true }
);

const Settings = mongoose.model<ISettings>("Settings", settingsSchema);

export default Settings;
