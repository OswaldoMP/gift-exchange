export interface Exchanges {
  id?: number;
  event_title?: string;
  date_event?: string;
  time_event?: string;
  money_event?: string;
  start_event?: string;
  upload_gift?: string;
  hero_subtitle?: string;
  register_subtitle?: string;
  dashboard_title?: string;
  dashboard_subtitle?: string;
  rules_text?: string;
  reminder_text?: string;
  draw_banner_note?: string;
  exchange_banner_note?: string;
  email_placeholder?: string;
  gift_name_placeholder?: string;
  gift_store_placeholder?: string;
  gift_link_placeholder?: string;
  email_notifications_enabled?: boolean;
}

export const DEFAULT_EXCHANGE_CONFIG: Required<Exchanges> = {
  id: 1,
  event_title: 'Intercambio 2026',
  date_event: '24 de diciembre 2026',
  time_event: '18:00 hrs',
  money_event: '$500 MXN',
  start_event: '12 de diciembre 2026',
  upload_gift: '10 de diciembre 2026',
  hero_subtitle:
    'Coordina el sorteo de Navidad 2026, comparte ideas de regalos y mantén a tu tribu conectada desde un único espacio.',
  register_subtitle:
    'Diseñamos una experiencia moderna para sumar participantes, registrar ideas de regalos y compartir actualizaciones con banners informativos en cada etapa de la Navidad 2026.',
  dashboard_title: 'Panel del intercambio navideño 2026',
  dashboard_subtitle:
    'Revisa tus ideas de regalo, solicita el sorteo y mantente al tanto del estado de la Navidad 2026.',
  rules_text: 'Incluye enlaces o tiendas para cada idea de regalo.',
  reminder_text: 'Comparte mínimo tres opciones para inspirar a tu amigo secreto.',
  draw_banner_note: 'Para recibir el resultado del sorteo navideño.',
  exchange_banner_note: 'Para dar y recibir regalo de tu amigo secreto.',
  email_placeholder: 'navidad2026@tuempresa.com',
  gift_name_placeholder: 'Ej. Audífonos inalámbricos, taza navideña...',
  gift_store_placeholder: 'Ej. Amazon, Liverpool, Mercado Libre...',
  gift_link_placeholder: 'https://tienda.com/mi-regalo-2026',
  email_notifications_enabled: false,
};

export function mergeExchangeConfig(partial?: Exchanges | null): Required<Exchanges> {
  return {
    ...DEFAULT_EXCHANGE_CONFIG,
    ...(partial || {}),
  };
}
