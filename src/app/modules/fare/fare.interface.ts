export interface IVehicleFare {
  ratePerKm: number;
  bookingFee: number;
  baseFee: number;
  minimumFare: number;
}

export interface IWaitingCharge {
  enabled: boolean;
  gracePeriod: number; // minutes
  rate: number; // per minute
}

export interface ISurcharge {
  enabled: boolean;
  value: number; // percentage or flat (your choice)
}

export interface IFare {
  country: string;

  minoGo: IVehicleFare;
  minoXL: IVehicleFare;
  minoMoto: IVehicleFare;

  waitingCharge: IWaitingCharge;
  surcharge: ISurcharge;

  platformCommissionPercentage: number;

  isActive: boolean;
}
