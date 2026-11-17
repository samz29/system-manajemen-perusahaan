// API Client Helper
const API = {
  getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('auth_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  },

  async get(url) {
    try {
      const res = await fetch(url, {
        headers: this.getHeaders()
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Gagal memuat data');
      return json;
    } catch (err) {
      console.error(`API GET ${url} error:`, err);
      throw err;
    }
  },

  async post(url, body) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body)
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Gagal mengirim data');
      return json;
    } catch (err) {
      console.error(`API POST ${url} error:`, err);
      throw err;
    }
  },

  async put(url, body) {
    try {
      const res = await fetch(url, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify(body)
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Gagal memperbarui data');
      return json;
    } catch (err) {
      console.error(`API PUT ${url} error:`, err);
      throw err;
    }
  },

  async delete(url) {
    try {
      const res = await fetch(url, { 
        method: 'DELETE',
        headers: this.getHeaders()
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Gagal menghapus data');
      return json;
    } catch (err) {
      console.error(`API DELETE ${url} error:`, err);
      throw err;
    }
  }
};
