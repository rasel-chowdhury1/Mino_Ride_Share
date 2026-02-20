export type TPromoStatus = 'ACTIVE' | 'INACTIVE';

export interface IPromo {
  title: string;
  description?: string;

  discount: number; // percentage or flat
  minimumSpend: number;

  expirationDate: Date;

  status: TPromoStatus;

  isDeleted: boolean;
}
