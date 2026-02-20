import  Settings, { ISettings } from "./setting.model";


const getSettings = async () =>{
    return await Settings.find().sort({ createdAt: -1 });
}

// Get the settings
const getSettingsByKey = async (payload: {key: "mrpRepairWaiver" | "repairLiability" | "warrentyCoverage" | "customerResponsibilities" | "pricing" | "importantNotice" | "privacyPolicy" | "aboutUs" | "termsService" }): Promise<ISettings | null> => {
    return await Settings.findOne(payload).sort({ createdAt: -1 });
};



// Create or update the privacy policy
const updateSettingsByKey = async (key: "mrpRepairWaiver" | "repairLiability" | "warrentyCoverage" | "customerResponsibilities" | "pricing" | "importantNotice" | "privacyPolicy" | "aboutUs" | "termsService", content: string): Promise<ISettings> => {
    let policy = await Settings.findOne({key});
    if (!policy) {
        policy = new Settings({key, content });
    } else {
        policy.content = content;
    }
    return await policy.save();
};

export const settingsService = {
    getSettings,
    getSettingsByKey,
    updateSettingsByKey
};
