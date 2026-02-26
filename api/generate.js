import axios from "axios";
import FormData from "form-data";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const prompt = body?.prompt;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const HF_TOKEN = process.env.HUGGINGFACE_API_KEY;
    const PINATA_JWT = process.env.PINATA_JWT;

    if (!HF_TOKEN || !PINATA_JWT) {
      return res.status(500).json({
        error: "Missing HUGGINGFACE_API_KEY or PINATA_JWT"
      });
    }

    const model = "stabilityai/stable-diffusion-xl-base-1.0";

    const hfResponse = await axios({
      method: "POST",
      url: `https://router.huggingface.co/hf-inference/models/${model}`,
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "image/png"
      },
      data: {
        inputs: prompt,
        options: { wait_for_model: true }
      },
      responseType: "arraybuffer",
      validateStatus: () => true
    });

    const contentType = hfResponse.headers["content-type"];

    if (!contentType || !contentType.includes("image")) {
      const errorText = Buffer.from(hfResponse.data).toString();
      throw new Error(`HuggingFace Error: ${errorText}`);
    }

    const imageBuffer = Buffer.from(hfResponse.data);

    const formData = new FormData();
    formData.append("file", imageBuffer, {
      filename: "ai-image.png",
      contentType: "image/png"
    });

    formData.append(
      "pinataMetadata",
      JSON.stringify({ name: "ai-generated-image" })
    );

    const pinataResponse = await axios.post(
      "https://api.pinata.cloud/pinning/pinFileToIPFS",
      formData,
      {
        maxBodyLength: "Infinity",
        headers: {
          Authorization: `Bearer ${PINATA_JWT}`,
          ...formData.getHeaders()
        }
      }
    );

    const ipfsHash = pinataResponse.data.IpfsHash;

    return res.status(200).json({
      success: true,
      prompt,
      ipfsHash,
      gatewayUrl: `https://gateway.pinata.cloud/ipfs/${ipfsHash}`,
      ipfsUri: `ipfs://${ipfsHash}`
    });
  } catch (error) {
    return res.status(500).json({
      error: "Image generation or upload failed",
      details: error.message
    });
  }
}
