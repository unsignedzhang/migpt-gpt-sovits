const express = require('express');
const fs = require('fs');
const path = require('path');
const request = require('request');
const { promisify } = require('util');
const readdir = promisify(fs.readdir);
const app = express();

const port = 7788;//可以改，不要和其他端口冲突就行

// 定义MP3文件所在的文件夹路径
const songsDir = path.join(__dirname, 'songs');

// 读取songs文件夹中的所有文件
function getRandomSong() {
  return new Promise((resolve, reject) => {
    readdir(songsDir, (err, files) => {
      if (err) {
        reject(err);
        return;
      }
      const mp3Files = files.filter(file => path.extname(file).toLowerCase() === '.mp3');
      if (mp3Files.length === 0) {
        reject(new Error('No MP3 files found in the songs directory.'));
        return;
      }
      const randomIndex = Math.floor(Math.random() * mp3Files.length);
      resolve(path.join(songsDir, mp3Files[randomIndex]));
    });
  });
}

// 创建temp文件夹（如果不存在）
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
}

app.get('/api/tts.mp3', (req, res) => {
   // 将查询字符串中的+替换为&（小爱音箱的bug,请求时会把&符号错误地发成+号）
    const queryString = req.url.split('?')[1].replace(/\+/g, '&');
    // 解析修改后的查询字符串
    const params = new URLSearchParams(queryString);
    const text = params.get('text');
    console.log('[AI返回文本] : ' + text);
    if (!text) {
        return res.status(400).send('Missing or invalid text parameter');
    }

    // 构建请求参数的文件名
    const paramsKey = text;
    const fileName = `temp_${paramsKey}.mp3`;
    const filePath = path.join(tempDir, fileName);
    
    // 判断是否需要调用清唱文件
    if (paramsKey.startsWith("[调用工具][清唱]")) {
		//判断大模型的回复是否是调用清唱
		var songPath="";
		getRandomSong().then(songPath => {
		// 随机读取MP3文件
		console.log("[调用清唱] - [随机] ：[" + songPath + "]");
				// 设置响应头，告诉客户端这是一个MP3文件
				res.setHeader('Content-Type', 'audio/mpeg');
                res.sendFile(songPath);
		}).catch(err => {
			res.writeHead(500);
			res.end('Internal Server Error');
		});
	} else {
    // 检查temp文件夹中是否存在相同的文件，有则直接发送缓存
    if (fs.existsSync(filePath)) {
        console.log('[语音合成] : Returning cached file');
        //console.log('Returning cached file');
        res.setHeader('Content-Type', 'audio/mpeg');
        res.sendFile(filePath);
    } else {
		console.log('[语音合成] : Waiting');

        // 构建请求URL
        const url = `http://127.0.0.1:9880/?refer_wav_path=demo/123.wav&prompt_text=%E6%80%8E%E4%B9%88%E8%BF%98%E6%98%AF%E8%BF%99%E5%BC%A0%E5%9B%BE%E6%8D%8F%EF%BC%8C%E8%83%BD%E4%B8%8D%E8%83%BD%E6%8D%A2%E4%B8%80%E5%BC%A0%E5%91%80&prompt_language=zh&text_language=zh&text=${encodeURIComponent(text)}`;

        // 发送请求到另一个接口
        request.get(url)
            .on('response', (response) => {
                if (response.statusCode === 200) {
                    // 将响应数据保存到文件
                    const writeStream = fs.createWriteStream(filePath);
                    response.pipe(writeStream);
                    writeStream.on('finish', () => {
                        writeStream.close();
                        res.setHeader('Content-Type', 'audio/mpeg');
                        res.sendFile(filePath);
                        //console.log('发送语音');
                    });
                } else {
                    res.status(response.statusCode).send('Error: Unable to fetch wav file');
                }
            })
            .on('error', (error) => {
                res.status(500).send('Error: ' + error.message);
            });
    }
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});