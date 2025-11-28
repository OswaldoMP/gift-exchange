export interface Gift {
  id: string;
  title: string; // nombre
  store?: string; // store
  link?: string; // link
  priceEstimate?: string; //
}

export interface GiftEntity {
  id?: number,
  participant_id?: string,
  title?: string,
  store?: string,
  link?: string,
  removed?: number
}