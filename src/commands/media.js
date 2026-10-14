import { Sticker, StickerTypes } from 'wa-sticker-formatter';
import { getDatabase } from '../database.js';
import { downloadWhatsAppMedia, downloadYoutubeAudio, downloadYoutubeVideo, downloadTiktokVideo, downloadTiktokAudio, downloadInstagramVideo, downloadInstagramAudio } from '../utils/helpers.js';
import { checkIfOwner } from './admin.js';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { execFile } from 'child_process';

// Configura o caminho do ffmpeg
ffmpeg.setFfmpegPath(ffmpegPath);

// Função para converter WebP estático para PNG usando FFMPEG
function convertWebpToPng(inputPath) {
  const outputPath = path.join(os.tmpdir(), `unsticker-${Date.now()}.png`);
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err))
      .run();
  });
}

// Função para converter Vídeo em Figurinha Animada WebP (Otimizado para WhatsApp Celular)
function convertVideoToAnimatedSticker(inputPath) {
  const outputPath = path.join(os.tmpdir(), `anim-sticker-${Date.now()}.webp`);
  return new Promise((resolve, reject) => {
    // Passagem 1: 512x512, fps=10, 6s de duração, qscale=45 (Tamanho leve para celular)
    const args = [
      '-y',
      '-i', inputPath,
      '-vcodec', 'libwebp',
      '-filter_complex', '[0:v] scale=512:512:force_original_aspect_ratio=decrease,fps=10,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
      '-loop', '0',
      '-ss', '00:00:00',
      '-t', '00:00:06',
      '-qscale', '45',
      '-preset', 'default',
      '-an',
      '-vsync', '0',
      outputPath
    ];
    execFile(ffmpegPath, args, (err) => {
      if (err) return reject(err);
      try {
        const buffer = fs.readFileSync(outputPath);
        try { fs.unlinkSync(outputPath); } catch (_) {}

        // Se por acaso exceder 480KB (limite em que o WhatsApp Mobile trava a animação), aplica passagem 2 mais leve
        if (buffer.length > 490000) {
          const pass2Path = path.join(os.tmpdir(), `anim-sticker-p2-${Date.now()}.webp`);
          const pass2Args = [
            '-y',
            '-i', inputPath,
            '-vcodec', 'libwebp',
            '-filter_complex', '[0:v] scale=384:384:force_original_aspect_ratio=decrease,fps=8,pad=384:384:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
            '-loop', '0',
            '-ss', '00:00:00',
            '-t', '00:00:05',
            '-qscale', '35',
            '-preset', 'default',
            '-an',
            '-vsync', '0',
            pass2Path
          ];
          execFile(ffmpegPath, pass2Args, (err2) => {
            if (err2) return resolve(buffer);
            try {
              const buf2 = fs.readFileSync(pass2Path);
              try { fs.unlinkSync(pass2Path); } catch (_) {}
              resolve(buf2);
            } catch (_) {
              resolve(buffer);
            }
          });
          return;
        }

        resolve(buffer);
      } catch (e) {
        reject(e);
      }
    });
  });
}

// Função para converter Figurinha Animada (WebP) em MP4/GIF
function convertWebpToMp4(inputPath) {
  const outputPath = path.join(os.tmpdir(), `unsticker-anim-${Date.now()}.mp4`);
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-i', inputPath,
      '-pix_fmt', 'yuv420p',
      '-c:v', 'libx264',
      '-movflags', '+faststart',
      '-filter_complex', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      outputPath
    ];
    execFile(ffmpegPath, args, (err) => {
      if (err) return reject(err);
      resolve(outputPath);
    });
  });
}

// Detecta se a mensagem citada é de visualização única (qualquer wrapper)
function isViewOnceQuoted(quoted) {
  if (!quoted || typeof quoted !== 'object') return false;
  if (quoted.viewOnceMessage || quoted.viewOnceMessageV2 || quoted.viewOnceMessageV2Extension) return true;
  // Wrapper aninhado um nível (ex: ephemeralMessage envolvendo view-once)
  for (const key of ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension', 'documentWithCaptionMessage']) {
    const inner = quoted[key]?.message || quoted[key];
    if (inner && typeof inner === 'object' && (inner.viewOnceMessage || inner.viewOnceMessageV2 || inner.viewOnceMessageV2Extension)) {
      return true;
    }
  }
  return false;
}

// Extrai imagem (direta ou citada) para figurinha.
// Retorna { mediaMessage } ou { error: 'VIEWONCE' | 'VIDEO' | 'NONE' }.
// Mídia de visualização única é SEMPRE recusada aqui: só o /ver
// (restrito a autorizados) pode revelá-la.
export function extractStickerImage(msg) {
  const from = msg.key.remoteJid;

  if (msg.message?.imageMessage) {
    return { mediaMessage: msg };
  }
  if (msg.message?.videoMessage) {
    return { error: 'VIDEO' };
  }

  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (!quoted) return { error: 'NONE' };

  if (isViewOnceQuoted(quoted)) {
    return { error: 'VIEWONCE' };
  }

  if (quoted.imageMessage) {
    return {
      mediaMessage: {
        key: {
          remoteJid: from,
          id: msg.message.extendedTextMessage.contextInfo.stanzaId,
          participant: msg.message.extendedTextMessage.contextInfo.participant
        },
        message: quoted
      }
    };
  }
  if (quoted.videoMessage) {
    return { error: 'VIDEO' };
  }
  return { error: 'NONE' };
}

// Converte imagem em figurinha WebP 512x512 preservando a proporção
// (o /sticker padrão estica a imagem — por isso sai "torta").
// mode 'fit': imagem inteira, sem corte, com fundo transparente (padrão do WhatsApp).
// mode 'fill': preenche tudo (corte central), sem bordas — figurinha maior.
function convertImageToSticker(inputPath, mode = 'fit', quality = 85) {
  const outputPath = path.join(os.tmpdir(), `sticker-${mode}-${Date.now()}-${Math.floor(Math.random() * 1e6)}.webp`);
  const vf = mode === 'fill'
    ? 'scale=512:512:force_original_aspect_ratio=increase,crop=512:512'
    : 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000';
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-i', inputPath,
      '-vf', vf,
      '-vcodec', 'libwebp',
      '-lossless', '0',
      '-quality', String(quality),
      '-preset', 'picture',
      '-an',
      outputPath
    ];
    execFile(ffmpegPath, args, (err) => {
      if (err) return reject(err);
      try {
        const buffer = fs.readFileSync(outputPath);
        try { fs.unlinkSync(outputPath); } catch (_) {}
        resolve(buffer);
      } catch (e) {
        reject(e);
      }
    });
  });
}

// Converte com fallback de qualidade para respeitar o limite do WhatsApp (~500KB)
export async function convertImageToStickerSized(inputPath, mode) {
  let buffer = await convertImageToSticker(inputPath, mode, 85);
  if (buffer.length > 450 * 1024) {
    buffer = await convertImageToSticker(inputPath, mode, 60);
  }
  return buffer;
}

export async function handleMediaCommands(sock, msg, command, args, sender) {
  const from = msg.key.remoteJid;
  const reply = async (text) => {
    await sock.sendMessage(from, { text }, { quoted: msg });
  };

  const db = getDatabase();

  switch (command) {
    case 'sticker': {
      let mediaMessage = null;
      let mediaType = null;

      // Verifica se a mensagem original é imagem ou vídeo curto
      if (msg.message?.imageMessage) {
        mediaMessage = msg;
        mediaType = 'image';
      } else if (msg.message?.videoMessage) {
        const duration = msg.message.videoMessage.seconds;
        if (duration > 15) {
          return reply('⚠️ O vídeo deve ter no máximo 15 segundos para virar figurinha animada.');
        }
        mediaMessage = msg;
        mediaType = 'video';
      } else {
        // Verifica a mensagem citada
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (quoted) {
          // 🔒 Visualização única não vira figurinha (só o /ver restrito revela)
          if (isViewOnceQuoted(quoted)) {
            return reply('🔒 Mídia de visualização única não pode virar figurinha. Ela só pode ser revelada com /ver (restrito).');
          }
          if (quoted.imageMessage) {
            mediaMessage = {
              key: {
                remoteJid: from,
                id: msg.message.extendedTextMessage.contextInfo.stanzaId,
                participant: msg.message.extendedTextMessage.contextInfo.participant
              },
              message: quoted
            };
            mediaType = 'image';
          } else if (quoted.videoMessage) {
            const duration = quoted.videoMessage.seconds;
            if (duration > 15) {
              return reply('⚠️ O vídeo deve ter no máximo 15 segundos para virar figurinha animada.');
            }
            mediaMessage = {
              key: {
                remoteJid: from,
                id: msg.message.extendedTextMessage.contextInfo.stanzaId,
                participant: msg.message.extendedTextMessage.contextInfo.participant
              },
              message: quoted
            };
            mediaType = 'video';
          }
        }
      }

      if (!mediaMessage) {
        return reply('⚠️ Envie uma imagem/vídeo com o comando /sticker na legenda, ou responda a uma imagem/vídeo com o comando.');
      }

      await reply('⏳ Criando sua figurinha, aguarde...');

      try {
        const filePath = await downloadWhatsAppMedia(mediaMessage, mediaType);
        let buffer;

        if (mediaType === 'video') {
          // Converte o vídeo em WebP animado com FFMPEG
          buffer = await convertVideoToAnimatedSticker(filePath);
        } else {
          // Imagem estática
          const sticker = new Sticker(filePath, {
            pack: 'WhatsApp Automation Bot 🤖',
            author: 'Bot de Whatsapp',
            type: StickerTypes.FULL,
            quality: 60
          });
          buffer = await sticker.toBuffer();
        }
        
        // Apaga arquivo temporário
        try { fs.unlinkSync(filePath); } catch (_) {}

        await sock.sendMessage(from, { sticker: buffer }, { quoted: msg });
      } catch (error) {
        console.error('Erro ao criar sticker:', error);
        return reply('⚠️ Não foi possível criar a figurinha. Certifique-se de que a imagem ou vídeo é válido.');
      }
      break;
    }

    case 'sticker2':
    case 'sticker3': {
      // sticker2 = imagem inteira com proporção original (fundo transparente)
      // sticker3 = preenche tudo com corte central (maior, sem bordas)
      const mode = command === 'sticker2' ? 'fit' : 'fill';
      const res = extractStickerImage(msg);

      if (res.error === 'VIEWONCE') {
        return reply('🔒 Mídia de visualização única não pode virar figurinha. Ela só pode ser revelada com /ver (restrito).');
      }
      if (res.error === 'VIDEO') {
        return reply('⚠️ O comando /' + command + ' funciona apenas com imagens. Para vídeos curtos use /sticker.');
      }
      if (res.error || !res.mediaMessage) {
        return reply('⚠️ Envie uma imagem com o comando /' + command + ' na legenda, ou responda a uma imagem com o comando.');
      }

      await reply('⏳ Criando sua figurinha, aguarde...');

      try {
        const filePath = await downloadWhatsAppMedia(res.mediaMessage, 'image');
        const buffer = await convertImageToStickerSized(filePath, mode);

        try { fs.unlinkSync(filePath); } catch (_) {}

        await sock.sendMessage(from, { sticker: buffer }, { quoted: msg });
      } catch (error) {
        console.error(`Erro ao criar ${command}:`, error);
        return reply('⚠️ Não foi possível criar a figurinha. Certifique-se de que a imagem é válida.');
      }
      break;
    }

    case 'unsticker': {
      const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      let stickerMessage = null;
      let isAnimated = false;

      if (quoted?.stickerMessage) {
        stickerMessage = {
          key: {
            remoteJid: from,
            id: msg.message.extendedTextMessage.contextInfo.stanzaId,
            participant: msg.message.extendedTextMessage.contextInfo.participant
          },
          message: quoted
        };
        isAnimated = quoted.stickerMessage.isAnimated === true;
      }

      if (!stickerMessage) {
        return reply('⚠️ Responda a uma figurinha com /unsticker para transformá-la em imagem ou GIF/vídeo.');
      }

      await reply('⏳ Convertendo figurinha, aguarde...');

      try {
        const filePath = await downloadWhatsAppMedia(stickerMessage, 'sticker');
        
        if (isAnimated) {
          // Tenta converter WebP animado em MP4/GIF
          try {
            const mp4Path = await convertWebpToMp4(filePath);
            await sock.sendMessage(from, { 
              video: { url: mp4Path }, 
              gifPlayback: true,
              caption: '🎬 Figurinha animada convertida em GIF com sucesso!' 
            }, { quoted: msg });
            
            try { fs.unlinkSync(filePath); } catch (_) {}
            try { fs.unlinkSync(mp4Path); } catch (_) {}
            return;
          } catch (animErr) {
            console.warn('⚠️ Falha ao converter sticker animado para MP4, tentando PNG:', animErr.message);
          }
        }

        // Se for estático ou fallback para PNG
        const pngPath = await convertWebpToPng(filePath);
        await sock.sendMessage(from, { image: { url: pngPath }, caption: '🖼️ Figurinha convertida com sucesso!' }, { quoted: msg });
        
        try { fs.unlinkSync(filePath); } catch (_) {}
        try { fs.unlinkSync(pngPath); } catch (_) {}
      } catch (error) {
        console.error('Erro ao converter figurinha:', error);
        return reply('⚠️ Erro ao converter a figurinha.');
      }
      break;
    }

    case 'ver': {
      // Verificar se é o dono ou se está na lista de autorizados
      const isOwner = checkIfOwner(sender, msg);
      const isAuthorized = db.autorizadosVer?.includes(sender);

      if (!isOwner && !isAuthorized) {
        return reply('⚠️ Você não tem permissão para usar este comando.');
      }

      const contextInfo = msg.message?.extendedTextMessage?.contextInfo ||
                          msg.message?.imageMessage?.contextInfo ||
                          msg.message?.videoMessage?.contextInfo || {};

      const quoted = contextInfo?.quotedMessage || 
                     msg.message?.viewOnceMessageV2?.message || 
                     msg.message?.viewOnceMessage?.message;

      let viewOnceContent = null;
      let mediaType = null;

      if (quoted) {
        if (quoted.viewOnceMessageV2?.message?.imageMessage) {
          viewOnceContent = quoted.viewOnceMessageV2.message.imageMessage;
          mediaType = 'image';
        } else if (quoted.viewOnceMessageV2?.message?.videoMessage) {
          viewOnceContent = quoted.viewOnceMessageV2.message.videoMessage;
          mediaType = 'video';
        } else if (quoted.viewOnceMessageV2Extension?.message?.imageMessage) {
          viewOnceContent = quoted.viewOnceMessageV2Extension.message.imageMessage;
          mediaType = 'image';
        } else if (quoted.viewOnceMessageV2Extension?.message?.videoMessage) {
          viewOnceContent = quoted.viewOnceMessageV2Extension.message.videoMessage;
          mediaType = 'video';
        } else if (quoted.viewOnceMessage?.message?.imageMessage) {
          viewOnceContent = quoted.viewOnceMessage.message.imageMessage;
          mediaType = 'image';
        } else if (quoted.viewOnceMessage?.message?.videoMessage) {
          viewOnceContent = quoted.viewOnceMessage.message.videoMessage;
          mediaType = 'video';
        } else if (quoted.imageMessage) {
          viewOnceContent = quoted.imageMessage;
          mediaType = 'image';
        } else if (quoted.videoMessage) {
          viewOnceContent = quoted.videoMessage;
          mediaType = 'video';
        }
      }

      if (!viewOnceContent) {
        return reply('⚠️ Responda a uma mensagem de visualização única (foto ou vídeo) com /ver.');
      }

      const mediaKey = viewOnceContent.mediaKey;
      const mediaKeyLength = typeof mediaKey === 'string'
        ? mediaKey.trim().length
        : (mediaKey?.byteLength ?? mediaKey?.length ?? 0);
      if (!mediaKey || mediaKeyLength === 0) {
        return reply('⚠️ O WhatsApp não forneceu a chave necessária para abrir esta mídia. Peça para enviarem a foto ou o vídeo novamente.');
      }

      await reply('⏳ Baixando mídia de visualização única, aguarde...');

      try {
        const cleanQuoted = {};
        if (mediaType === 'image') cleanQuoted.imageMessage = viewOnceContent;
        if (mediaType === 'video') cleanQuoted.videoMessage = viewOnceContent;

        const stanzaId = contextInfo.stanzaId || msg.key.id;
        const participant = contextInfo.participant || sender;

        const simulatedMsg = {
          key: {
            remoteJid: from,
            id: stanzaId,
            participant: participant
          },
          message: cleanQuoted
        };

        const filePath = await downloadWhatsAppMedia(simulatedMsg, mediaType);

        if (mediaType === 'image') {
          await sock.sendMessage(from, { image: { url: filePath }, caption: '👁️ Mídia revelada!' }, { quoted: msg });
        } else {
          await sock.sendMessage(from, { video: { url: filePath }, caption: '👁️ Mídia revelada!' }, { quoted: msg });
        }

        // Deleta arquivo temporário
        try { fs.unlinkSync(filePath); } catch (_) {}
      } catch (error) {
        if (error?.message?.includes('Cannot derive from empty media key')) {
          return reply('⚠️ O WhatsApp não forneceu a chave necessária para abrir esta mídia. Peça para enviarem a foto ou o vídeo novamente.');
        }
        console.error('Erro ao revelar visualização única:', error);
        return reply('⚠️ Erro ao tentar baixar e revelar a mídia.');
      }
      break;
    }

    case 'play': {
      const query = args.join(' ').trim();
      if (!query) {
        return reply('⚠️ Digite o nome da música ou o link do YouTube/TikTok/Instagram. Exemplo: /play Linkin Park Numb');
      }

      if (/(tiktok\.com|vt\.tiktok|vm\.tiktok)/i.test(query)) {
        await reply('⏳ Baixando áudio do TikTok, aguarde...');
        let music;
        try {
          music = await downloadTiktokAudio(query);
          await sock.sendMessage(
            from, 
            { 
              audio: fs.readFileSync(music.filePath), 
              mimetype: 'audio/mp4', 
              fileName: `${music.title}.mp3` 
            }, 
            { quoted: msg }
          );
          return;
        } catch (error) {
          console.error('Erro ao baixar áudio do TikTok via /play:', error);
          const detail = error?.message ? ` (${error.message.slice(0, 120)})` : '';
          return reply(`⚠️ Erro ao baixar áudio do TikTok${detail}.`);
        } finally {
          if (music?.filePath && fs.existsSync(music.filePath)) {
            try { fs.unlinkSync(music.filePath); } catch (_) {}
          }
        }
      }

      if (/(instagram\.com|instagr\.am)/i.test(query)) {
        await reply('⏳ Baixando áudio do Instagram, aguarde...');
        let music;
        try {
          music = await downloadInstagramAudio(query);
          await sock.sendMessage(
            from, 
            { 
              audio: fs.readFileSync(music.filePath), 
              mimetype: 'audio/mp4', 
              fileName: `${music.title}.mp3` 
            }, 
            { quoted: msg }
          );
          return;
        } catch (error) {
          console.error('Erro ao baixar áudio do Instagram via /play:', error);
          return reply('⚠️ Erro ao baixar áudio do Instagram. Verifique se a publicação é pública.');
        } finally {
          if (music?.filePath && fs.existsSync(music.filePath)) {
            try { fs.unlinkSync(music.filePath); } catch (_) {}
          }
        }
      }

      await reply('⏳ Buscando e baixando áudio do YouTube, aguarde...');

      let music;
      try {
        music = await downloadYoutubeAudio(query);

        await sock.sendMessage(
          from, 
          { 
            audio: fs.readFileSync(music.filePath), 
            mimetype: 'audio/mp4', 
            fileName: `${music.title}.mp3` 
          }, 
          { quoted: msg }
        );
      } catch (error) {
        console.error('Erro ao baixar música:', error);
        const detail = error?.message ? ` (${error.message.slice(0, 100)})` : '';
        return reply(`⚠️ Erro ao buscar/baixar a música${detail}. Tente novamente em instantes.`);
      } finally {
        if (music?.filePath && fs.existsSync(music.filePath)) {
          try { fs.unlinkSync(music.filePath); } catch (_) {}
        }
      }
      break;
    }

    case 'video': {
      const query = args.join(' ');
      if (!query) {
        return reply('⚠️ Digite o nome do vídeo ou o link do YouTube/TikTok/Instagram. Exemplo: /video Minecraft Speedrun');
      }

      if (/tiktok\.com/i.test(query)) {
        await reply('⏳ Baixando vídeo do TikTok sem marca d\'água, aguarde...');
        try {
          const video = await downloadTiktokVideo(query);
          await sock.sendMessage(
            from, 
            { 
              video: { url: video.filePath }, 
              caption: `🎥 *${video.title}*\n\nCriador: ${video.author}`
            }, 
            { quoted: msg }
          );
          fs.unlinkSync(video.filePath);
          return;
        } catch (error) {
          console.error('Erro ao baixar vídeo do TikTok via /video:', error);
          const detail = error?.message ? ` (${error.message.slice(0, 120)})` : '';
          return reply(`⚠️ Erro ao baixar vídeo do TikTok${detail}. Verifique se o link é público e tente novamente.`);
        }
      }

      if (/instagram\.com/i.test(query)) {
        await reply('⏳ Baixando vídeo do Instagram, aguarde...');
        try {
          const video = await downloadInstagramVideo(query);
          await sock.sendMessage(
            from, 
            { 
              video: { url: video.filePath }, 
              mimetype: 'video/mp4',
              caption: `🎥 *${video.title}*\n\nOrigem: Instagram`
            }, 
            { quoted: msg }
          );
          fs.unlinkSync(video.filePath);
          return;
        } catch (error) {
          console.error('Erro ao baixar vídeo do Instagram via /video:', error);
          return reply('⚠️ Erro ao baixar vídeo do Instagram. Verifique se a publicação é pública.');
        }
      }

      await reply('⏳ Buscando e baixando vídeo do YouTube, aguarde...');

      try {
        const video = await downloadYoutubeVideo(query);

        await sock.sendMessage(
          from, 
          { 
            video: { url: video.filePath }, 
            caption: `🎥 *${video.title}*\n\nCanal: ${video.author}\nVisualizações: ${video.views.toLocaleString()}`
          }, 
          { quoted: msg }
        );

        // Limpa temporários
        fs.unlinkSync(video.filePath);
      } catch (error) {
        console.error('Erro ao baixar vídeo:', error);
        const detail = error?.message ? ` (${error.message.slice(0, 100)})` : '';
        return reply(`⚠️ Erro ao buscar/baixar o vídeo${detail}. O vídeo pode ser muito grande ou indisponível.`);
      }
      break;
    }

    case 'ig':
    case 'insta':
    case 'igvideo':
    case 'instavideo': {
      const url = args[0];
      if (!url || !/instagram\.com/i.test(url)) {
        return reply('⚠️ Cole um link válido do Instagram. Exemplo: `/ig https://www.instagram.com/reel/...`');
      }

      await reply('⏳ Baixando vídeo do Instagram, aguarde...');

      try {
        const video = await downloadInstagramVideo(url);
        await sock.sendMessage(
          from, 
          { 
            video: { url: video.filePath }, 
            mimetype: 'video/mp4',
            caption: `🎥 *${video.title}*\n\nOrigem: Instagram`
          }, 
          { quoted: msg }
        );
        fs.unlinkSync(video.filePath);
      } catch (error) {
        console.error('Erro ao baixar vídeo do Instagram:', error);
        return reply('⚠️ Erro ao baixar vídeo do Instagram. Verifique o link e tente novamente.');
      }
      break;
    }

    case 'igaudio':
    case 'instaaudio':
    case 'igplay': {
      const url = args[0];
      if (!url || !/instagram\.com/i.test(url)) {
        return reply('⚠️ Cole um link válido do Instagram. Exemplo: `/igaudio https://www.instagram.com/reel/...`');
      }

      await reply('⏳ Baixando áudio do Instagram, aguarde...');

      try {
        const music = await downloadInstagramAudio(url);
        await sock.sendMessage(
          from, 
          { 
            audio: { url: music.filePath }, 
            mimetype: 'audio/mp4', 
            fileName: `${music.title}.mp3` 
          }, 
          { quoted: msg }
        );
        fs.unlinkSync(music.filePath);
      } catch (error) {
        console.error('Erro ao baixar áudio do Instagram:', error);
        return reply('⚠️ Erro ao baixar áudio do Instagram. Verifique o link e tente novamente.');
      }
      break;
    }

    case 'tiktok':
    case 'ttvideo': {
      const url = args[0];
      if (!url || !/tiktok\.com/i.test(url)) {
        return reply('⚠️ Cole um link válido do TikTok. Exemplo: `/tiktok https://vm.tiktok.com/...`');
      }

      await reply('⏳ Baixando vídeo do TikTok sem marca d\'água, aguarde...');

      try {
        const video = await downloadTiktokVideo(url);
        await sock.sendMessage(
          from, 
          { 
            video: { url: video.filePath }, 
            caption: `🎥 *${video.title}*\n\nCriador: ${video.author}`
          }, 
          { quoted: msg }
        );
        fs.unlinkSync(video.filePath);
      } catch (error) {
        console.error('Erro ao baixar vídeo do TikTok:', error);
        const detail = error?.message ? ` (${error.message.slice(0, 120)})` : '';
        return reply(`⚠️ Erro ao baixar vídeo do TikTok${detail}. Verifique o link e tente novamente.`);
      }
      break;
    }

    case 'tiktokaudio':
    case 'ttplay': {
      const url = args[0];
      if (!url || !/tiktok\.com/i.test(url)) {
        return reply('⚠️ Cole um link válido do TikTok. Exemplo: `/tiktokaudio https://vm.tiktok.com/...`');
      }

      await reply('⏳ Baixando áudio do TikTok, aguarde...');

      try {
        const music = await downloadTiktokAudio(url);
        await sock.sendMessage(
          from, 
          { 
            audio: { url: music.filePath }, 
            mimetype: 'audio/mp4', 
            fileName: `${music.title}.mp3` 
          }, 
          { quoted: msg }
        );
        fs.unlinkSync(music.filePath);
      } catch (error) {
        console.error('Erro ao baixar áudio do TikTok:', error);
        const detail = error?.message ? ` (${error.message.slice(0, 120)})` : '';
        return reply(`⚠️ Erro ao baixar áudio do TikTok${detail}. Verifique o link e tente novamente.`);
      }
      break;
    }

    default:
      break;
  }
}

