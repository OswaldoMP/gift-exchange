export interface Gift {
  id: string;
  title: string; // nombre
  store?: string; // store
  link?: string; // link
  priceEstimate?: string; //
}

export interface GiftEntity {
  id?: number,
  participant_id: number,
  title?: string,
  store?: string,
  link?: string
}