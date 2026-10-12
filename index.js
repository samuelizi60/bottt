const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const ytdl = require("ytdl-core");
const ytSearch = require("yt-search");
const axios = require("axios");
const ffmpeg = require("fluent-ffmpeg");

const client = new Client({ authStrategy: new LocalAuth() });

client.on("ready", () => { console.log("Bot WhatsApp pronto!"); });

client.on("message", async message => {
    const txt = message.body.toLowerCase();
    
    if (txt === "/menu") {
        await message.reply("*MENU DE OPÇÕES*\n\n" +
            "• /play <nome/link> — Baixar música\n" +
            "• /video <nome/link> — Baixar vídeo\n" +
            "• /ig <link> — Baixar Reels / Instagram\n" +
            "• /tiktok <link> — Baixar TikTok sem marca\n" +
            "• /sticker — Criar figurinha de imagem/vídeo\n" +
            "• /unsticker — Converter figurinha em imagem\n" +
            "• /ver — Revelar mídia de visualização única");
        return;
    }

    if (txt.startsWith("/play")) {
        const query = txt.replace("/play", "").trim();
        if (!query) { await message.reply("Por favor, forneça um nome ou link após o /play"); return; }
        await message.reply("Baixando música...");
        try {
            let video;
            if (query.startsWith("http")) { video = ytdl.getInfo(query); }
            else { const results = await ytSearch(query); video = results.videos.length > 0 ? results.videos[0] : null; if (!video) { await message.reply("Não encontrei nenhum vídeo com esse nome."); return; } }
            const info = await video; const stream = ytdl(info.videoId, { quality: "highest" }); const media = MessageMedia.fromFileStream(stream.path, "audio/mpeg"); await message.reply(media, null, { sendMedia: true });
        } catch (err) { console.error(err); await message.reply("Erro ao baixar a música. Tente novamente."); }
        return;
    }

    if (txt.startsWith("/video")) {
        const query = txt.replace("/video", "").trim();
        if (!query) { await message.reply("Por favor, forneça um nome ou link após o /video"); return; }
        await message.reply("Baixando vídeo...");
        try {
            let video;
            if (query.startsWith("http")) { video = ytdl.getInfo(query); }
            else { const results = await ytSearch(query); video = results.videos.length > 0 ? results.videos[0] : null; if (!video) { await message.reply("Não encontrei nenhum vídeo com esse nome."); return; } }
            const info = await video; const stream = ytdl(info.videoId, { quality: "highest" }); const media = MessageMedia.fromFileStream(stream.path, "video/mp4"); await message.reply(media, null, { sendMedia: true });
        } catch (err) { console.error(err); await message.reply("Erro ao baixar o vídeo. Tente novamente."); }
        return;
    }

    if (txt.startsWith("/ig")) {
        const link = txt.replace("/ig", "").trim();
        if (!link) { await message.reply("Por favor, forneça um link do Instagram após o /ig"); return; }
        await message.reply("Baixando Reels/Post do Instagram...");
        try { const res = await axios.get("https://api.likan.xyz/dl/ig?url=" + encodeURIComponent(link)); if (res.data && res.data.url) { const media = MessageMedia.fromFileStream(res.data.url, "video/mp4"); await message.reply(media, null, { sendMedia: true }); } else { await message.reply("Não foi possível baixar o conteúdo do Instagram."); } } catch (err) { console.error(err); await message.reply("Erro ao baixar do Instagram. Tente novamente."); }
        return;
    }

    if (txt.startsWith("/tiktok")) {
        const link = txt.replace("/tiktok", "").trim();
        if (!link) { await message.reply("Por favor, forneça um link do TikTok após o /tiktok"); return; }
        await message.reply("Baixando vídeo do TikTok...");
        try { const res = await axios.get("https://api.likan.xyz/dl/tiktok?url=" + encodeURIComponent(link)); if (res.data && res.data.url) { const media = MessageMedia.fromFileStream(res.data.url, "video/mp4"); await message.reply(media, null, { sendMedia: true }); } else { await message.reply("Não foi possível baixar o conteúdo do TikTok."); } } catch (err) { console.error(err); await message.reply("Erro ao baixar do TikTok. Tente novamente."); }
        return;
    }

    if (txt === "/sticker") {
        if (!message.hasMedia) { await message.reply("Por favor, envie uma imagem ou vídeo para criar a figurinha."); return; }
        await message.reply("Criando figurinha...");
        try { const media = await message.downloadMedia(); if (media.mimetype.startsWith("image")) { const stickerPath = "/tmp/sticker_" + Date.now() + ".webp"; await new Promise((resolve, reject) => { ffmpeg(media.path).outputOptions(["-vcodec","libwebp","-lossless","1"]).on("end",resolve).on("error",reject).saveToFile(stickerPath); }); const stickerMsg = MessageMedia.fromFileStream(stickerPath, "image/webp"); await message.reply(stickerMsg); require("fs").unlinkSync(stickerPath); } else if (media.mimetype.startsWith("video")) { const stickerPath = "/tmp/sticker_" + Date.now() + ".webm"; await new Promise((resolve, reject) => { ffmpeg(media.path).outputOptions(["-vcodec","libwebp","-"]).on("end",resolve).on("error",reject).saveToFile(stickerPath); }); const stickerMsg = MessageMedia.fromFileStream(stickerPath, "image/webp"); await message.reply(stickerMsg); require("fs").unlinkSync(stickerPath); } } catch (err) { console.error(err); await message.reply("Erro ao criar a figurinha."); }
        return;
    }

    if (txt === "/unsticker") {
        if (!message.hasMedia) { await message.reply("Por favor, envie uma figurinha (.webp) para converter."); return; }
        await message.reply("Convertendo figurinha em imagem...");
        try { const media = await message.downloadMedia(); if (media.mimetype === "image/webp") { const imgPath = "/tmp/unsticker_" + Date.now() + ".png"; await new Promise((resolve, reject) => { ffmpeg(media.path).outputOptions(["-vf","format=rgba","-compress"]).on("end",resolve).on("error",reject).saveToFile(imgPath); }); const imgMsg = MessageMedia.fromFileStream(imgPath, "image/png"); await message.reply(imgMsg); require("fs").unlinkSync(imgPath); } else { await message.reply("A mídia enviada não é uma figurinha WebP."); } } catch (err) { console.error(err); await message.reply("Erro ao converter a figurinha."); }
        return;
    }

    if (txt === "/ver") {
        if (!message.hasMedia) { await message.reply("Por favor, envie uma mídia para visualizar."); return; }
        await message.reply("Enviando mídia de visualização única...");
        try { const media = await message.downloadMedia(); const singleViewMsg = MessageMedia.fromFileStream(media.path, media.mimetype); await message.reply(singleViewMsg); } catch (err) { console.error(err); await message.reply("Erro ao processar a mídia."); }
        return;
    }
});

client.initialize();
