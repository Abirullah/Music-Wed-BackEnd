import mongoose from "mongoose";
import SongsModel from "../Models/SongsModel.js";
import ContantModel from "../Models/ContantModel.js";
import PurchaseModel from "../Models/PurchaseModel.js";
import PiracyComplaintModel from "../Models/PiracyComplaintModel.js";
import UserModel from "../Models/UserModel.js";
import { uploadBufferToCloudinary } from "../Utils/cloudinaryUpload.js";
import {
  extractSongPayload,
  extractContentPayload,
  normalizeSong,
  normalizeContent,
  validateSongPayload,
  validateContentPayload,
} from "../Utils/catalogMapper.js";

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ""));

const toObjectId = (value) => new mongoose.Types.ObjectId(String(value));

const parseInteger = (value, fallback) => {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const normalizeDashboardGraphType = (value = "") => {
  const normalized = String(value || "all").toLowerCase();
  if (normalized === "song" || normalized === "music") return "song";
  if (normalized === "content") return "content";
  return "all";
};

const buildAvailableYears = (createdAt) => {
  const currentYear = new Date().getFullYear();
  const startYear = new Date(createdAt || Date.now()).getFullYear();
  const firstYear = Number.isFinite(startYear) ? Math.min(startYear, currentYear) : currentYear;
  const years = [];
  for (let year = firstYear; year <= currentYear; year += 1) {
    years.push(year);
  }
  return years.length ? years : [currentYear];
};

const allowOwnerAccess = async ({ ownerId, requesterId, requesterRole }) => {
  if (!isValidObjectId(ownerId)) {
    return { error: "Invalid owner id", status: 400 };
  }

  const owner = await UserModel.findById(ownerId);
  if (!owner) {
    return { error: "Owner not found", status: 404 };
  }

  const normalizedRole = String(requesterRole || "").toLowerCase();
  const canAccess = String(requesterId) === String(ownerId) || normalizedRole === "admin";

  if (!canAccess) {
    return { error: "Forbidden", status: 403 };
  }

  if (!["owner", "admin"].includes(String(owner.role).toLowerCase())) {
    return { error: "User is not allowed to manage owner dashboard", status: 403 };
  }

  return { owner };
};

const pickAffiliateLinkFromSong = (song) => {
  return (
    song.affiliateLink ||
    song.links?.spotify ||
    song.links?.youtube ||
    song.links?.gaana ||
    song.links?.amazon ||
    song.links?.wynk ||
    song.links?.apple ||
    song.links?.other ||
    song.musicLink ||
    ""
  );
};

const pickAffiliateLinkFromContent = (content) => {
  return (
    content.links?.youtube ||
    content.links?.instagram ||
    content.links?.facebook ||
    content.links?.twitter ||
    content.links?.linkedin ||
    content.links?.people ||
    content.links?.snapchat ||
    content.links?.other ||
    content.coverTemplate ||
    ""
  );
};

export const createSong = async (req, res) => {
  try {
    console.log("=== CREATE SONG REQUEST RECEIVED ===");
    console.log("Request headers:", req.headers);
    console.log("Request files:", req.files ? Object.keys(req.files) : "No files");
    console.log("Request body keys:", Object.keys(req.body || {}));
    
    const ownerId = String(req.params.ownerId || "");
    const requester = {
      requesterId: req.user?.id,
      requesterRole: req.user?.role,
    };
    
    console.log("Owner ID:", ownerId);
    console.log("Requester:", requester);

    const ownerAccess = await allowOwnerAccess({ ownerId, ...requester });
    if (ownerAccess.error) {
      return res.status(ownerAccess.status).json({ message: ownerAccess.error , wow: "erro" });
    }

    const isMultipart = String(req.headers["content-type"] || "")
      .toLowerCase()
      .includes("multipart/form-data");
    const bodyKeys = Object.keys(req.body || {});

    if (isMultipart && bodyKeys.length === 0 && !req.files) {
      return res.status(400).json({
        message:
          "Upload payload is empty. Please re-login and retry with song and template files.",
      });
    }

    const payload = extractSongPayload(req.body);
    const fallbackFiles = Array.isArray(req.files?.files) ? req.files.files : [];

    const fallbackMusicFile =
      fallbackFiles.find((file) =>
        String(file?.mimetype || "").toLowerCase().startsWith("audio/"),
      ) || fallbackFiles[0];

    const fallbackCoverFile =
      fallbackFiles.find((file) =>
        String(file?.mimetype || "").toLowerCase().startsWith("image/"),
      ) ||
      fallbackFiles.find((file) => file !== fallbackMusicFile) ||
      fallbackFiles[1];

    const musicFile = req.files?.musicFile?.[0] || fallbackMusicFile;
    const coverFile = req.files?.coverFile?.[0] || fallbackCoverFile;

    if (!req.files?.musicFile?.[0] && fallbackMusicFile) {
      console.log("Using fallback music file from multipart field 'files'");
    }

    if (!req.files?.coverFile?.[0] && fallbackCoverFile) {
      console.log("Using fallback cover file from multipart field 'files'");
    }

    console.log("Music file info:", musicFile ? {
      fieldname: musicFile.fieldname,
      originalname: musicFile.originalname,
      encoding: musicFile.encoding,
      mimetype: musicFile.mimetype,
      size: musicFile.size,
      hasBuffer: !!musicFile.buffer
    } : "No music file");
    
    console.log("Cover file info:", coverFile ? {
      fieldname: coverFile.fieldname,
      originalname: coverFile.originalname,
      encoding: coverFile.encoding,
      mimetype: coverFile.mimetype,
      size: coverFile.size,
      hasBuffer: !!coverFile.buffer
    } : "No cover file");

    if (!musicFile) {
      return res.status(400).json({ message: "Music file is required" });
    }

    if (!coverFile) {
      return res.status(400).json({ message: "Cover template file is required" });
    }

    console.log("Starting Cloudinary upload...");
    const uploadStart = Date.now();
    
    const [uploadedMusic, uploadedCover] = await Promise.all([
      uploadBufferToCloudinary(musicFile, {
        folder: "songs/files",
        resourceType: "auto",
      }).then(result => {
        console.log("Music file uploaded successfully:", result.secure_url);
        return result;
      }),
      uploadBufferToCloudinary(coverFile, {
        folder: "songs/covers",
        resourceType: "image",
      }).then(result => {
        console.log("Cover file uploaded successfully:", result.secure_url);
        return result;
      }),
    ]);
    
    const uploadDuration = Date.now() - uploadStart;
    console.log(`Cloudinary upload completed in ${uploadDuration}ms`);
    payload.musicLink = uploadedMusic.secure_url;
    payload.cover = uploadedCover.secure_url;

    const validationError = validateSongPayload(payload);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const song = await SongsModel.create({
      owner: ownerId,
      ...payload,
    });

    return res.status(201).json({
      message: "Song uploaded successfully",
      data: normalizeSong(song),
    });
  } catch (error) {
    console.error("Error creating song:", error);
    if (res.headersSent) {
      return;
    }
    return res
      .status(500)
      .json({ message: error?.message || "Failed to upload song" });
  }
};

export const createContent = async (req, res) => {
  try {
    console.log("=== CREATE CONTENT REQUEST RECEIVED ===");
    console.log("Request headers:", req.headers);
    console.log("Request files:", req.files ? Object.keys(req.files) : "No files");
    console.log("Request body keys:", Object.keys(req.body || {}));
    
    const ownerId = String(req.params.ownerId || "");
    const requester = {
      requesterId: req.user?.id,
      requesterRole: req.user?.role,
    };
    
    console.log("Owner ID:", ownerId);
    console.log("Requester:", requester);

    const ownerAccess = await allowOwnerAccess({ ownerId, ...requester });
    if (ownerAccess.error) {
      return res.status(ownerAccess.status).json({ message: ownerAccess.error });
    }

    const isMultipart = String(req.headers["content-type"] || "")
      .toLowerCase()
      .includes("multipart/form-data");
    const bodyKeys = Object.keys(req.body || {});

    if (isMultipart && bodyKeys.length === 0 && !req.files) {
      return res.status(400).json({
        message:
          "Upload payload is empty. Please re-login and retry with content and template files.",
      });
    }

    const payload = extractContentPayload(req.body);
    const contentFile = req.files?.contentFile?.[0];
    const coverTemplateFile = req.files?.coverTemplateFile?.[0];

    if (!contentFile) {
      return res.status(400).json({ message: "Content file is required" });
    }

    if (!coverTemplateFile) {
      return res.status(400).json({ message: "Cover template file is required" });
    }

    const [uploadedContent, uploadedTemplate] = await Promise.all([
      uploadBufferToCloudinary(contentFile, {
        folder: "contents/files",
        resourceType: "auto",
      }),
      uploadBufferToCloudinary(coverTemplateFile, {
        folder: "contents/templates",
        resourceType: "image",
      }),
    ]);
    payload.contentFileUrl = uploadedContent.secure_url;
    payload.coverTemplate = uploadedTemplate.secure_url;

    if (!payload.permission?.uploadPermission) {
      return res.status(400).json({ message: "Upload permission is required" });
    }

    const validationError = validateContentPayload(payload);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const content = await ContantModel.create({
      owner: ownerId,
      ...payload,
    });

    return res.status(201).json({
      message: "Content uploaded successfully",
      data: normalizeContent(content),
    });
  } catch (error) {
    console.error("Error creating content:", error);
    if (res.headersSent) {
      return;
    }
    return res
      .status(500)
      .json({ message: error?.message || "Failed to upload content" });
  }
};

export const getOwnerUploads = async (req, res) => {
  try {
    const ownerId = String(req.params.ownerId || "");
    const requester = {
      requesterId: req.user?.id,
      requesterRole: req.user?.role,
    };

    const ownerAccess = await allowOwnerAccess({ ownerId, ...requester });
    if (ownerAccess.error) {
      return res.status(ownerAccess.status).json({ message: ownerAccess.error });
    }

    const type = String(req.query.type || "all").toLowerCase();
    const search = String(req.query.search || req.query.q || "").trim();
    const page = parseInteger(req.query.page, 1);
    const limit = parseInteger(req.query.limit, 20);

    const regex = search ? new RegExp(search, "i") : null;
    const baseOwnerQuery = { owner: toObjectId(ownerId) };

    const songQuery = {
      ...baseOwnerQuery,
      ...(regex
        ? {
            $or: [
              { musicName: regex },
              { artistName: regex },
              { language: regex },
              { genre: regex },
              { mood: regex },
            ],
          }
        : {}),
    };

    const contentQuery = {
      ...baseOwnerQuery,
      ...(regex
        ? {
            $or: [
              { contentName: regex },
              { artistName: regex },
              { language: regex },
              { genre: regex },
              { mood: regex },
            ],
          }
        : {}),
    };

    const [songs, contents] = await Promise.all([
      type === "content" ? [] : SongsModel.find(songQuery).sort({ createdAt: -1 }).lean(),
      type === "song" || type === "music"
        ? []
        : ContantModel.find(contentQuery).sort({ createdAt: -1 }).lean(),
    ]);

    const rows = [
      ...songs.map((song) => ({
        id: String(song._id),
        itemType: "song",
        type: "Music",
        song: song.musicName,
        artistName: song.artistName,
        copyrightOwner: song.copyrightOwner,
        affiliateLink: pickAffiliateLinkFromSong(song),
        price: song.price,
        createdAt: song.createdAt,
      })),
      ...contents.map((content) => ({
        id: String(content._id),
        itemType: "content",
        type: "Content",
        song: content.contentName,
        artistName: content.artistName,
        copyrightOwner: content.copyrightOwner,
        affiliateLink: pickAffiliateLinkFromContent(content),
        price: content.price,
        createdAt: content.createdAt,
      })),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const total = rows.length;
    const start = (page - 1) * limit;
    const data = rows.slice(start, start + limit);

    return res.status(200).json({
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    console.error("Error fetching owner uploads:", error);
    return res.status(500).json({ message: "Failed to fetch uploads" });
  }
};

export const getOwnerDashboard = async (req, res) => {
  try {
    const ownerId = String(req.params.ownerId || "");
    const requester = {
      requesterId: req.user?.id,
      requesterRole: req.user?.role,
    };

    const ownerAccess = await allowOwnerAccess({ ownerId, ...requester });
    if (ownerAccess.error) {
      return res.status(ownerAccess.status).json({ message: ownerAccess.error });
    }

    const requestedGraphType = normalizeDashboardGraphType(req.query.type);
    const availableYears = buildAvailableYears(ownerAccess.owner.createdAt);
    const requestedYear = Number.parseInt(String(req.query.year || ""), 10);
    const selectedYear = availableYears.includes(requestedYear)
      ? requestedYear
      : availableYears[availableYears.length - 1];

    const graphStart = new Date(Date.UTC(selectedYear, 0, 1, 0, 0, 0, 0));
    const graphEnd = new Date(Date.UTC(selectedYear + 1, 0, 1, 0, 0, 0, 0));

    const [songsCount, contentCount, paidPurchases, recentSongs, recentContents, monthlyGraphRows] =
      await Promise.all([
        SongsModel.countDocuments({ owner: ownerId }),
        ContantModel.countDocuments({ owner: ownerId }),
        PurchaseModel.find({ owner: ownerId, status: "paid" })
          .sort({ purchasedAt: -1 })
          .limit(8)
          .populate("user", "name email")
          .lean(),
        SongsModel.find({ owner: ownerId }).sort({ createdAt: -1 }).limit(6).lean(),
        ContantModel.find({ owner: ownerId }).sort({ createdAt: -1 }).limit(6).lean(),
        PurchaseModel.aggregate([
          {
            $match: {
              owner: toObjectId(ownerId),
              status: "paid",
              ...(requestedGraphType === "all"
                ? {}
                : { itemType: requestedGraphType }),
            },
          },
          {
            $addFields: {
              effectiveDate: { $ifNull: ["$purchasedAt", "$createdAt"] },
            },
          },
          {
            $match: {
              effectiveDate: { $gte: graphStart, $lt: graphEnd },
            },
          },
          {
            $group: {
              _id: { $month: "$effectiveDate" },
              totalAmount: { $sum: "$amount" },
              totalSales: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),
      ]);

    const totalSales = paidPurchases.length;
    const totalRevenue = paidPurchases.reduce((sum, item) => sum + (item.amount || 0), 0);
    const musicRevenue = paidPurchases
      .filter((item) => item.itemType === "song")
      .reduce((sum, item) => sum + (item.amount || 0), 0);
    const contentRevenue = paidPurchases
      .filter((item) => item.itemType === "content")
      .reduce((sum, item) => sum + (item.amount || 0), 0);

    const recentUploads = [
      ...recentSongs.map((song) => ({
        id: String(song._id),
        type: "music",
        title: song.musicName,
        subtitle: song.artistName,
        createdAt: song.createdAt,
      })),
      ...recentContents.map((content) => ({
        id: String(content._id),
        type: "content",
        title: content.contentName,
        subtitle: content.artistName,
        createdAt: content.createdAt,
      })),
    ]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 8);

    const recentSales = paidPurchases.map((purchase) => ({
      id: String(purchase._id),
      customerName: purchase.user?.name || "Unknown",
      itemName: purchase.itemName,
      itemType: purchase.itemType,
      amount: purchase.amount,
      licenseCode: purchase.licenseCode,
      purchasedAt: purchase.purchasedAt || purchase.updatedAt,
    }));

    const monthlyMap = new Map(
      monthlyGraphRows.map((row) => [Number.parseInt(String(row._id), 10), row]),
    );
    const graphSeries = MONTH_LABELS.map((_, monthIndex) => {
      const row = monthlyMap.get(monthIndex + 1);
      return row ? row.totalAmount || 0 : 0;
    });
    const graphSales = MONTH_LABELS.map((_, monthIndex) => {
      const row = monthlyMap.get(monthIndex + 1);
      return row ? row.totalSales || 0 : 0;
    });

    return res.status(200).json({
      owner: {
        id: String(ownerAccess.owner._id),
        name: ownerAccess.owner.name,
        email: ownerAccess.owner.email,
        profilePicture: ownerAccess.owner.profilePicture || null,
        createdAt: ownerAccess.owner.createdAt || null,
      },
      stats: {
        musicUploaded: songsCount,
        contentUploaded: contentCount,
        totalUploaded: songsCount + contentCount,
        totalSales,
        totalRevenue,
        musicRevenue,
        contentRevenue,
      },
      graph: {
        type: requestedGraphType,
        year: selectedYear,
        availableYears,
        labels: MONTH_LABELS,
        series: graphSeries,
        salesSeries: graphSales,
        totalAmount: graphSeries.reduce((sum, value) => sum + value, 0),
      },
      recentUploads,
      recentSales,
    });
  } catch (error) {
    console.error("Error fetching owner dashboard:", error);
    return res.status(500).json({ message: "Failed to fetch owner dashboard" });
  }
};

export const getOwnerStatements = async (req, res) => {
  try {
    const ownerId = String(req.params.ownerId || "");
    const requester = {
      requesterId: req.user?.id,
      requesterRole: req.user?.role,
    };

    const ownerAccess = await allowOwnerAccess({ ownerId, ...requester });
    if (ownerAccess.error) {
      return res.status(ownerAccess.status).json({ message: ownerAccess.error });
    }

    const search = String(req.query.search || req.query.q || "").trim();
    const regex = search ? new RegExp(search, "i") : null;

    const query = {
      owner: ownerId,
      status: "paid",
      ...(regex
        ? {
            $or: [
              { itemName: regex },
              { artistName: regex },
              { licenseCode: regex },
            ],
          }
        : {}),
    };

    const purchases = await PurchaseModel.find(query)
      .sort({ purchasedAt: -1, createdAt: -1 })
      .populate("user", "name")
      .lean();

    const rows = purchases.map((purchase) => {
      const purchasedAt = purchase.purchasedAt || purchase.createdAt;
      const purchasedDate = purchasedAt ? new Date(purchasedAt) : new Date();
      const validDate = new Date(purchasedDate);
      validDate.setFullYear(validDate.getFullYear() + 1);

      return {
        id: String(purchase._id),
        date: purchasedDate.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),
        time: purchasedDate.toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        customer: purchase.user?.name || "Unknown",
        code: purchase.licenseCode || "",
        music: purchase.itemName,
        itemType: purchase.itemType,
        valid: validDate.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),
        total: purchase.amount,
        status: "valid",
      };
    });

    const totals = {
      overallTotal: rows.reduce((sum, row) => sum + (row.total || 0), 0),
      musicTotal: rows
        .filter((row) => row.itemType === "song")
        .reduce((sum, row) => sum + (row.total || 0), 0),
      contentTotal: rows
        .filter((row) => row.itemType === "content")
        .reduce((sum, row) => sum + (row.total || 0), 0),
    };

    return res.status(200).json({ totals, rows });
  } catch (error) {
    console.error("Error fetching owner statements:", error);
    return res.status(500).json({ message: "Failed to fetch statements" });
  }
};

export const listPiracyComplaints = async (req, res) => {
  try {
    const ownerId = String(req.params.ownerId || "");
    const requester = {
      requesterId: req.user?.id,
      requesterRole: req.user?.role,
    };

    const ownerAccess = await allowOwnerAccess({ ownerId, ...requester });
    if (ownerAccess.error) {
      return res.status(ownerAccess.status).json({ message: ownerAccess.error });
    }

    const search = String(req.query.search || req.query.q || "").trim();
    const regex = search ? new RegExp(search, "i") : null;

    const complaints = await PiracyComplaintModel.find({
      owner: ownerId,
      ...(regex
        ? {
            $or: [
              { itemName: regex },
              { uploaderName: regex },
              { reporterName: regex },
              { reporterEmail: regex },
            ],
          }
        : {}),
    })
      .sort({ complaintDate: -1, createdAt: -1 })
      .lean();

    const rows = complaints.map((complaint) => ({
      id: String(complaint._id),
      type: complaint.itemType === "song" ? "Music" : "Content",
      song: complaint.itemName,
      uploaderName: complaint.uploaderName || complaint.ownerName || "-",
      reporterName: complaint.reporterName || "Anonymous user",
      reporterEmail: complaint.reporterEmail || "-",
      complaint: new Date(complaint.complaintDate).toLocaleString("en-IN"),
      pincode: complaint.pincode || "-",
      timeofframe: complaint.violationTimeframe || "-",
      details: complaint.details || "",
      status: complaint.status,
    }));

    return res.status(200).json({ rows });
  } catch (error) {
    console.error("Error fetching piracy complaints:", error);
    return res.status(500).json({ message: "Failed to fetch complaints" });
  }
};

export const createPiracyComplaint = async (req, res) => {
  try {
    const ownerId = String(req.params.ownerId || "");
    const itemType = String(req.body.itemType || "").toLowerCase();
    const itemId = String(req.body.itemId || "");
    const pincode = String(req.body.pincode || "").trim();
    const violationTimeframe = String(req.body.violationTimeframe || "").trim();
    const details = String(req.body.details || "").trim();
    const reporter = await UserModel.findById(req.user?.id || null)
      .select("name email")
      .lean();

    if (!["song", "content"].includes(itemType)) {
      return res.status(400).json({ message: "Invalid item type" });
    }

    if (!isValidObjectId(ownerId) || !isValidObjectId(itemId)) {
      return res.status(400).json({ message: "Invalid ids provided" });
    }

    const model = itemType === "song" ? SongsModel : ContantModel;
    const itemModel = itemType === "song" ? "Song" : "Contant";
    const ownerUser = await UserModel.findById(ownerId).select("name").lean();

    const item = await model.findOne({ _id: itemId, owner: ownerId }).lean();
    if (!item) {
      return res.status(404).json({ message: "Owner item not found" });
    }

    const complaint = await PiracyComplaintModel.create({
      reportedBy: req.user?.id || null,
      reporterName: String(reporter?.name || ""),
      reporterEmail: String(reporter?.email || req.user?.email || ""),
      owner: ownerId,
      ownerName: String(ownerUser?.name || "").trim(),
      uploaderName: String(ownerUser?.name || "").trim(),
      itemType,
      itemModel,
      item: itemId,
      itemName: itemType === "song" ? item.musicName : item.contentName,
      pincode,
      violationTimeframe,
      details,
    });

    return res.status(201).json({
      message: "Piracy complaint created successfully",
      complaint: {
        id: String(complaint._id),
        owner: String(complaint.owner),
        itemType: complaint.itemType,
        itemId: String(complaint.item),
        itemName: complaint.itemName,
      },
    });
  } catch (error) {
    console.error("Error creating piracy complaint:", error);
    return res.status(500).json({ message: "Failed to create complaint" });
  }
};
