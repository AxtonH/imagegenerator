export type Profile = {
  id: string;
  full_name: string;
  email: string;
  department?: string | null;
  job_title?: string | null;
  role: "user" | "creative_lead" | "admin";
};

export type GeneratedImage = {
  id: string;
  generation_id: string;
  image_url: string;
  is_saved: boolean;
  is_favorite: boolean;
  downloaded_count: number;
  created_at: string;
};

export type Generation = {
  id: string;
  original_prompt: string;
  enhanced_prompt: string;
  mode: string;
  aspect_ratio: string;
  number_of_variations: number;
  status: string;
  estimated_cost: number;
  created_at: string;
  generated_images?: GeneratedImage[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function getToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("prezlab_token");
}

export function setToken(token: string) {
  window.localStorage.setItem("prezlab_token", token);
}

export function clearToken() {
  window.localStorage.removeItem("prezlab_token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (response.status === 401 && typeof window !== "undefined") {
      clearToken();
      window.location.href = "/login";
    }
    throw new Error(body.detail || "Request failed");
  }
  return response.json();
}

export const api = {
  login: (email: string, password: string) =>
    request<{ access_token: string; profile: Profile }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    }),
  me: () => request<Profile>("/auth/me"),
  generate: (body: {
    prompt: string;
    aspect_ratio: string;
    variations: number;
    mode: string;
  }) =>
    request<{ generation: Generation; images: GeneratedImage[] }>("/generate-image", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  refine: (body: {
    parent_generation_id: string;
    parent_image_id?: string;
    prompt: string;
    refinement_prompt: string;
    aspect_ratio: string;
    variations: number;
    mode: string;
  }) =>
    request<{ generation: Generation; images: GeneratedImage[] }>("/refine-image", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  imageAction: (image_id: string, action: "download_image" | "save_image" | "favorite_image") =>
    request<GeneratedImage>("/image-action", {
      method: "POST",
      body: JSON.stringify({ image_id, action })
    }),
  downloadImage: async (image_id: string, format: "png" | "jpeg" | "webp") => {
    const token = getToken();
    const response = await fetch(`${API_URL}/download-image/${image_id}?format=${format}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      if (response.status === 401 && typeof window !== "undefined") {
        clearToken();
        window.location.href = "/login";
      }
      throw new Error(body.detail || "Download failed");
    }
    return response.blob();
  },
  history: () => request<{ generations: Generation[] }>("/history"),
  adminUsage: () =>
    request<{
      total_users: number;
      active_users: number;
      total_generations: number;
      generations_by_user: Array<{ user: string; email: string; count: number }>;
      generations_by_department: Array<{ department: string; count: number }>;
      failed_generations: number;
      estimated_gemini_cost: number;
      recent_usage_events: Array<Record<string, any>>;
      users_near_limit: Array<Record<string, any>>;
    }>("/admin/usage")
};
