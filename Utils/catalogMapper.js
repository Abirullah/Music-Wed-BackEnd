import SongsModel from "../Models/SongsModel.js";
import ContantModel from "../Models/ContantModel.js";

export const getModelByItemType = (itemType = "") => {
  if (itemType === "song") return { model: SongsModel, itemModel: "Song" };
  if (itemType === "content") return { model: ContantModel, itemModel: "Contant" };
  return null;
};

export const parseReleaseDate = (value) => {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  // Frontend sends month input in YYYY-MM format.
  if (/^\d{4}-\d{2}$/.test(raw)) {
    return new Date(`${raw}-01T00:00:00.000Z`);
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed;
};

export const toNumber = (value, fallback = 0) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const normalized = value.replace(/[^\d.-]/g, "");
    if (!normalized) return fallback;

    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }

  return fallback;
};

const parseLooseJsonObject = (value) => {
  if (!value) return null;

  if (typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  if (typeof value !== "string") return null;

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
};

const pickBodyValue = (body, keys = []) => {
  for (const key of keys) {
    const candidate = body?.[key];
    if (Array.isArray(candidate)) {
      const first = candidate.find((item) => String(item || "").trim());
      if (first !== undefined) return first;
      continue;
    }

    if (candidate !== undefined && candidate !== null && String(candidate).trim() !== "") {
      return candidate;
    }
  }

  return "";
};

const toIsoString = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

export const normalizeSong = (songDoc, extra = {}) => {
  if (!songDoc) return null;

  const song = typeof songDoc.toObject === "function" ? songDoc.toObject() : songDoc;

  return {
    id: String(song._id),
    itemType: "song",
    title: song.musicName,
    artist: song.artistName,
    language: song.language,
    genre: song.genre,
    mood: song.mood,
    price: song.price ?? 0,
    cover: song.cover,
    previewUrl: song.musicLink,
    ownerId: song.owner ? String(song.owner) : null,
    releaseDate: toIsoString(song.releaseDate),
    createdAt: toIsoString(song.createdAt),
    links: song.links || {},
    affiliateLink: song.affiliateLink || "",
    purpose: song.purpose || {},
    copyrightOwner: song.copyrightOwner,
    agreement1: song.agreement1,
    agreement2: song.agreement2,
    musicCategory: song.musicCategory,
    ...extra,
  };
};

export const normalizeContent = (contentDoc, extra = {}) => {
  if (!contentDoc) return null;

  const content =
    typeof contentDoc.toObject === "function" ? contentDoc.toObject() : contentDoc;

  return {
    id: String(content._id),
    itemType: "content",
    title: content.contentName,
    artist: content.artistName,
    language: content.language,
    genre: content.genre,
    mood: content.mood,
    price: content.price ?? 0,
    cover: content.coverTemplate,
    previewUrl: content.contentFileUrl || content.links?.youtube || content.coverTemplate,
    contentFileUrl: content.contentFileUrl || "",
    ownerId: content.owner ? String(content.owner) : null,
    releaseDate: toIsoString(content.releaseDate),
    createdAt: toIsoString(content.createdAt),
    expiryType: content.expiryType || "",
    experience: content.experience || "",
    links: content.links || {},
    permission: content.permission || {},
    repostPermission: content.repostPermission || "",
    copyrightOwner: content.copyrightOwner,
    annexture: content.annexture,
    agreement: content.agreement,
    ...extra,
  };
};

export const normalizeCatalogItem = (itemDoc, extra = {}) => {
  if (!itemDoc) return null;
  const isSong = itemDoc.itemType === "song" || itemDoc.musicName;
  return isSong ? normalizeSong(itemDoc, extra) : normalizeContent(itemDoc, extra);
};

export const extractSongPayload = (body = {}) => {
  const releaseDate = parseReleaseDate(body.releaseDate);
  const category = pickBodyValue(body, ["musicCategory", "category"]);
  const copyrightOwner = pickBodyValue(body, [
    "copyright",
    "copyrightOwner",
    "Copyright owner",
    "copyright owner",
    "ownerName",
  ]);
  const musicLink = pickBodyValue(body, ["musicLink", "musicUrl", "songUrl"]);
  const cover = pickBodyValue(body, ["cover", "coverTemplate", "songTemplate"]);
  const musicName = pickBodyValue(body, ["musicName", "songName", "title"]);
  const artistName = pickBodyValue(body, ["artistName", "artist"]);
  const language = pickBodyValue(body, ["language"]);
  const genre = pickBodyValue(body, ["genre"]);
  const mood = pickBodyValue(body, ["mood"]);
  const affiliateLink = pickBodyValue(body, ["affiliateLink"]);
  const songLinks = parseLooseJsonObject(
    pickBodyValue(body, ["songLinks", "songsLinks", "links"]),
  );
  const fallbackAgreementText = pickBodyValue(body, [
    "text",
    "agreementText",
    "agreement",
  ]);
  const agreement1 = pickBodyValue(body, [
    "agreement1",
    "annexture",
    "annexure",
  ]);
  const agreement2 = pickBodyValue(body, ["agreement2", "agreement"]);
  const priceValue = pickBodyValue(body, ["price", "pricing"]);

  return {
    musicCategory: String(category || "Song").trim(),
    copyrightOwner: String(copyrightOwner || "").trim(),
    musicLink: String(musicLink || "").trim(),
    cover: String(cover || "").trim(),
    musicName: String(musicName || "").trim(),
    artistName: String(artistName || "").trim(),
    releaseDate,
    language: String(language || "").trim(),
    genre: String(genre || "").trim(),
    mood: String(mood || "").trim(),
    links: {
      spotify: String(body.spotify || songLinks?.spotify || "").trim(),
      youtube: String(body.youtube || songLinks?.youtube || "").trim(),
      gaana: String(body.gaana || songLinks?.gaana || songLinks?.jio || "").trim(),
      amazon: String(body.amazon || songLinks?.amazon || "").trim(),
      wynk: String(body.wynk || songLinks?.wynk || "").trim(),
      apple: String(body.apple || songLinks?.apple || "").trim(),
      other: String(body.other || songLinks?.other || "").trim(),
    },
    affiliateLink: String(affiliateLink || "").trim(),
    purpose: {
      pricingLicense: String(body.pricingLicense || "Individual").trim(),
      pricingUse: String(body.pricingUse || "").trim(),
      pricingPlace: String(body.pricingPlace || "").trim(),
      seatingCapacity: String(body.seatingCapacity || "").trim(),
      priceYear: toNumber(body.priceYear, 0),
      priceSixMonths: toNumber(body.priceSixMonths, 0),
    },
    price: toNumber(priceValue, 0),
    agreement1: String(agreement1 || fallbackAgreementText || "").trim(),
    agreement2: String(agreement2 || fallbackAgreementText || "").trim(),
  };
};

export const extractContentPayload = (body = {}) => {
  const releaseDate = parseReleaseDate(body.releaseDate);

  const uploadExpiryValue = String(
    pickBodyValue(body, ["uploadExpiryValue", "priceSixMonths", "expiryPrice"]) || "",
  ).trim();
  const uploadNonExpiryValue = String(
    pickBodyValue(body, ["uploadNonExpiryValue", "priceYear", "nonExpiryPrice"]) || "",
  ).trim();
  const copyrightOwner = pickBodyValue(body, ["copyright", "copyrightOwner"]);
  const coverTemplate = pickBodyValue(body, ["coverTemplate", "cover", "template"]);
  const contentFileUrl = pickBodyValue(body, ["contentFileUrl", "contentLink", "contentUrl"]);
  const contentName = pickBodyValue(body, ["contentName", "title"]);
  const artistName = pickBodyValue(body, ["artistName", "artist"]);
  const language = pickBodyValue(body, ["language"]);
  const genre = pickBodyValue(body, ["genre"]);
  const mood = pickBodyValue(body, ["mood"]);
  const expiryType = pickBodyValue(body, ["expiryType"]);
  const experience = pickBodyValue(body, ["experience"]);
  const uploadPermission = pickBodyValue(body, ["uploadPermission", "permissionType"]);
  const uploadPlatform = pickBodyValue(body, ["uploadPlatform", "platform"]);
  const subscriberRange = pickBodyValue(body, ["subscriberRange"]);
  const customLicense = pickBodyValue(body, ["customLicense"]);
  const uploadHeading = pickBodyValue(body, ["uploadHeading"]);
  const repostPermission = pickBodyValue(body, ["repostPermission"]);
  const annexture = pickBodyValue(body, ["annexture", "annexure"]);
  const agreement = pickBodyValue(body, ["agreement"]);

  return {
    copyrightOwner: String(copyrightOwner || "").trim(),
    coverTemplate: String(coverTemplate || "").trim(),
    contentFileUrl: String(contentFileUrl || "").trim(),
    contentName: String(contentName || "").trim(),
    artistName: String(artistName || "").trim(),
    releaseDate,
    language: String(language || "").trim(),
    genre: String(genre || "").trim(),
    mood: String(mood || "").trim(),
    expiryType: String(expiryType || "").trim(),
    experience: String(experience || "").trim(),
    links: {
      instagram: String(body.instagram || "").trim(),
      youtube: String(body.youtube || "").trim(),
      twitter: String(body.twitter || "").trim(),
      facebook: String(body.facebook || "").trim(),
      linkedin: String(body.linkedin || "").trim(),
      people: String(body.people || "").trim(),
      snapchat: String(body.snapchat || "").trim(),
      other: String(body.other || "").trim(),
    },
    permission: {
      uploadPermission: String(uploadPermission || "").trim(),
      uploadPlatform: String(uploadPlatform || "").trim(),
      subscriberRange: String(subscriberRange || "").trim(),
      customLicense: String(customLicense || "").trim(),
      uploadHeading: String(uploadHeading || "").trim(),
      uploadExpiryValue,
      uploadNonExpiryValue,
    },
    repostPermission: String(repostPermission || "").trim(),
    annexture: String(annexture || "").trim(),
    agreement: String(agreement || "").trim(),
    price: Math.max(toNumber(uploadNonExpiryValue, 0), toNumber(uploadExpiryValue, 0)),
  };
};

export const validateSongPayload = (payload) => {
  if (!payload.copyrightOwner) return "Copyright owner is required";
  if (!payload.musicLink) return "Music link is required";
  if (!payload.cover) return "Cover is required";
  if (!payload.musicName) return "Music name is required";
  if (!payload.artistName) return "Artist name is required";
  if (!payload.releaseDate) return "Release date is required";
  if (!payload.language) return "Language is required";
  if (!payload.genre) return "Genre is required";
  if (!payload.mood) return "Mood is required";
  if (!payload.agreement1) return "Agreement annexture is required";
  if (!payload.agreement2) return "Agreement text is required";

  return null;
};

export const validateContentPayload = (payload) => {
  if (!payload.copyrightOwner) return "Copyright owner is required";
  if (!payload.coverTemplate) return "Cover template is required";
  if (!payload.contentName) return "Content name is required";
  if (!payload.artistName) return "Artist name is required";
  if (!payload.releaseDate) return "Release date is required";
  if (!payload.language) return "Language is required";
  if (!payload.genre) return "Genre is required";
  if (!payload.mood) return "Mood is required";
  if (!payload.uploadPermission && !payload.permission?.uploadPermission) {
    // This branch is kept for compatibility if caller validates raw body.
    return "Upload permission is required";
  }
  if (!payload.annexture) return "Annexture is required";
  if (!payload.agreement) return "Agreement is required";

  const hasAnyLink = [
    payload.links?.instagram,
    payload.links?.youtube,
    payload.links?.twitter,
    payload.links?.facebook,
    payload.links?.linkedin,
    payload.links?.people,
    payload.links?.snapchat,
    payload.links?.other,
  ].some((item) => Boolean(String(item || "").trim()));

  if (!hasAnyLink && !payload.contentFileUrl) {
    return "Upload at least one content link or content file";
  }

  return null;
};

export const buildCatalogQuery = ({ search = "", genre = "", mood = "", language = "", artist = "" }) => {
  const query = {};

  if (genre) query.genre = genre;
  if (mood) query.mood = mood;
  if (language) query.language = language;
  if (artist) query.artistName = artist;

  if (search) {
    const regex = new RegExp(search, "i");
    query.$or = [
      { musicName: regex },
      { contentName: regex },
      { artistName: regex },
      { genre: regex },
      { mood: regex },
      { language: regex },
    ];
  }

  return query;
};
