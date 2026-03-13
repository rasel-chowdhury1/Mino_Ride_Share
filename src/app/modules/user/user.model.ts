import bcrypt from 'bcrypt';
import { Schema, model } from 'mongoose';
import config from '../../config';
import {
  TUserCreate,
} from './user.interface';
import { Login_With } from './user.constants';

/*
|--------------------------------------------------------------------------
| Geo Location Schema
|--------------------------------------------------------------------------
*/

const locationSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      required: true,
      default: 'Point',
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true,
    },
  },
  { _id: false },
);

const addressSchema = new Schema(
  {
    address: { type: String, required: true },
    location: { type: locationSchema, required: true },
  },
  { _id: false },
);

/*
|--------------------------------------------------------------------------
| User Schema
|--------------------------------------------------------------------------
*/

const userSchema = new Schema<TUserCreate>(
  {
    name: {
      type: String,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
      select: false,
    },

    countryCode: {
      type: String,
      required: false,
      trim: true,
    },

    phoneNumber: {
      type: String,
      required: false,
      trim: true,
    },


    role: {
      type: String,
      enum: ['admin', 'passenger', 'driver', 'superadmin'],
      required: true,
    },

    gender: {
      type: String,
      enum: ['male', 'female', 'other'],
      required: false
    },

    dateOfBirth: {
      type: Date,
      required: false,
    },

    profileImage: {
      type: String,
      default: ""
    },

    country: {
      type: String,
      required: false,
      uppercase: true,
      index: true,
    },

    homeAddress: {
      type: addressSchema,
      required: false,
      default: {}
    },

    workAddress: {
      type: addressSchema,
      required: false,
      default: {}
    },

    adminVerified: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      required: true,
      default: 'pending',
    },


    driverProfileId: {
      type: Schema.Types.ObjectId,
      ref: 'Driver',
    },

    rating: {
      type: Number,
      required: true,
      default: 0,
    },

    totalReview: {
      type: Number,
      required: true,
      default: 0,
    },

    averageRating: {
      type: Number,
      required: true,
      default: 0,
    },

    wallet: {
      type: Number,
      required: true,
      default: 0,
    },
    driverType: {
      type: String,
      enum: ['car', 'motorcycle'],
      required: false
    },
    isDriverProfileCompleted: {
      type: Boolean,
      default: false,
    },

    status: {
      type: String,
      enum: ['active', 'blocked', 'banned'],
      required: true,
      default: 'active',
    },

    warnings: {
      count: { type: Number, default: 0 },
      logs: [
        {
          reason:    { type: String, required: true },
          warnedAt:  { type: Date, default: Date.now },
          warnedBy:  { type: Schema.Types.ObjectId, ref: 'User' },
        },
      ],
    },

    banReason: { type: String, default: null },
    bannedAt:  { type: Date, default: null },
    bannedBy:  { type: Schema.Types.ObjectId, ref: 'User', default: null },

    isDeleted: {
      type: Boolean,
      required: true,
      default: false,
    },

    acceptTerms: {
      type: Boolean,
      required: true,
      default: true
    },

    loginWth: {
      type: String,
      enum: Login_With,
      default: Login_With.credentials,
    },

    device: {
      ip: {
        type: String,
      },
      browser: {
        type: String,
      },
      os: {
        type: String,
      },
      device: {
        type: String,
      },
      lastLogin: {
        type: String,
      },
    },
  },
  {
    timestamps: true,
  },
);

/*
|--------------------------------------------------------------------------
| Indexes
|--------------------------------------------------------------------------
*/

// Optional geo index
userSchema.index({ 'homeAddress.location': '2dsphere' });

/*
|--------------------------------------------------------------------------
| Middleware
|--------------------------------------------------------------------------
*/

// 🔐 Hash Password Before Save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  this.password = await bcrypt.hash(
    this.password,
    Number(config.bcrypt_salt_rounds),
  );

  next();
});


// 🔒 Remove password from JSON response
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

// 🧹 Soft Delete Filtering
userSchema.pre('find', function (next) {
  this.find({ isDeleted: { $ne: true } });
  next();
});

userSchema.pre('findOne', function (next) {
  this.find({ isDeleted: { $ne: true } });
  next();
});

userSchema.pre('aggregate', function (next) {
  this.pipeline().unshift({
    $match: { isDeleted: { $ne: true } },
  });
  next();
});


userSchema.statics.isUserExist = async function (email: string) {
  console.log({ email });
  return await this.findOne({ email: email }).select('+password');
};

userSchema.statics.isUserActive = async function (email: string) {
  return await this.findOne({
    email: email,
    status: "active",
    isDeleted: false
  }).select('+password');
};

userSchema.statics.IsUserExistById = async function (id: string) {
  return await this.findById(id).select('+password');
};

userSchema.statics.isPasswordMatched = async function (
  plainTextPassword,
  hashedPassword,
) {
  return await bcrypt.compare(plainTextPassword, hashedPassword);
};
/*
|--------------------------------------------------------------------------
| Export Model
|--------------------------------------------------------------------------
*/

export const User = model<TUserCreate>('User', userSchema);
