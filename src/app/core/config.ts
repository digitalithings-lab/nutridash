// URL del backend de NutriPro. Para desarrollo se puede apuntar a otro backend desde el navegador:
// localStorage.setItem('nutripro.apiUrl', 'http://localhost:3100')
const PRODUCTION_API_URL = 'https://nutribackend.vercel.app';

function readOverride(): string | null {
  try {
    return localStorage.getItem('nutripro.apiUrl');
  } catch {
    return null;
  }
}

export const API_URL = (readOverride() ?? PRODUCTION_API_URL).replace(/\/$/, '');
