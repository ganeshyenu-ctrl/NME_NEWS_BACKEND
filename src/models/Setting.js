import mongoose from 'mongoose';

const settingSchema = new mongoose.Schema(
  {
    publicationName: {
      type: String,
      default: 'NME',
    },
    tagline: {
      type: String,
      default: 'Independent Perspectives. Informed Maritime Decisions.',
    },
    contactEmail: {
      type: String,
      default: 'contact@nme.local',
    },
    linkedinUrl: {
      type: String,
      default: 'https://www.linkedin.com/company/navigating-marine-excellence',
    },
    aboutText: {
      type: String,
      default: 'Navigating Marine Excellence provides critical maritime intelligence, analysis, and news for decision-makers worldwide.',
    },
    termsText: {
      type: String,
      default: 'All contents published on this platform are protected under international copyright treaties.',
    },
    privacyText: {
      type: String,
      default: 'We value your privacy. We never sell your personal data or email address to third parties.',
    },
    maintenanceMode: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

export const Setting = mongoose.model('Setting', settingSchema);
