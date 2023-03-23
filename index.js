const ytdl = require('ytdl-core');
const readline = require('readline');
const ffmpeg = require('fluent-ffmpeg');
const axios = require("axios");
const ytsr = require('ytsr');
const fs = require('fs')
const { spotify_clientid, spotify_clientsecret, song_path, spotify_playlist_id } = tryRequire('./configDev.json') || tryRequire('./config.json');
const exclude = ["official video", "official music video", "official hd video", "video"]
var spotifyApiKey

readline.cursorTo(process.stdout, 0, 0)
readline.clearScreenDown(process.stdout);

var songDownloaders = []

process.on('SIGINT', function () {
    console.log("Caught interrupt signal");

    process.stdout.write('\u001B[?25h');
    process.exit();
});

generateSpotifyApiKey().then(spotifyApiKey => {
    console.log("Refreshed Spotify Api Key!")
    getSpotifyPlaylist(spotify_playlist_id, 0, spotifyApiKey).then(async items => {

        console.log("TOTAL: " + items.length)
        var runningSongs = []

        var existingSongs = fs.readdirSync(song_path).filter(s => s.endsWith(".mp3"))

        var convertedSongsNames = []
        items.forEach(i=>{
            console.log(i)
            convertedSongsNames.push(`${i.track.name.replaceAll("\"", "").replaceAll("/", "")}.mp3`)
        })

        var songsProcessed = 0
        existingSongs.forEach(existingSong => {
            if (!convertedSongsNames.find(s => s == existingSong)) {
                console.log(`${existingSong} can no longer be found in the spotify playlist!`)
                console.log("Deleting It!")
                fs.unlinkSync(song_path + "/" + existingSong)
            }
        })

        process.stdout.write('\u001B[?25l');

        var updateScreen = function () {
            readline.cursorTo(process.stdout, 0, 0)

            process.stdout.write("\r\x1b[K")

            console.log(`Songs Done: ${songsProcessed}/${items.length}`)
            process.stdout.write("\r\x1b[K")



            for (const song of runningSongs) {
                process.stdout.clearLine(1);
                process.stdout.write(`${song.name}: ${(song?.progress?.targetSize / (song?.progress?.resultSize / 1000) * 100 || 0).toFixed(2)}%\n`)
            }
            if (songsProcessed == items.length) {
                readline.cursorTo(process.stdout, 0, 2)
                readline.clearScreenDown(process.stdout);
                console.log("DONE!")
            } else {
                readline.clearScreenDown(process.stdout);
                setTimeout(() => {
                    updateScreen()
                }, 100);
            }
        };

        updateScreen()


        for (const item of items) {
            if (existingSongs.includes(`${item.track.name.replaceAll("\"", "").replaceAll("/", "")}.mp3`)) {
                songsProcessed++
            } else {

                const songDownloader = async function () {
                    const filters1 = await ytsr.getFilters(item.track.name + " " + item.track.artists.map(a => a.name).join(" "));
                    const filter1 = filters1.get('Type').get('Video');
                    let results = await youtubeSearch(filter1.url)
                    var result = results.find(r => exclude.some(v => !r.title.toLowerCase().includes(v)))
                    if (!result) {
                        return console.log("Cannot find: " + item.track.name + " " + item.track.artists.map(a => a.name).join(" "))
                    }

                    let stream = ytdl(result.url, {
                        quality: 'highestaudio',
                    })

                    let info = await ytdl.getInfo(result.url)

                    let thing = ytdl.filterFormats(info.formats, 'audioonly')

                    const myPromise = new Promise((resolve, reject) => {
                        runningSongs.push({ name: item.track.name, id: item.id })

                        ffmpeg()
                            .input(stream)
                            .audioBitrate(128)
                            .addOutputOption('-metadata', 'title=' + item.track.name)
                            .addOutputOption('-metadata', 'artist=' + item.track.artists.map(a => a.name).join(", "))
                            .on('progress', p => {
                                var song = runningSongs.find(s => s.id == item.id)
                                p.resultSize = thing[0].contentLength
                                song.progress = p
                            })
                            .save(song_path + `/${item.track.name.replaceAll("\"", "").replaceAll("/", "")}.mp3`)
                            .on('end', () => {
                                finallyDone()
                            }).on('error', (e) => {
                                console.log(e)
                                finallyDone()
                            })
                        function finallyDone() {
                            const index = runningSongs.findIndex(s => s.id == item.id);
                            if (index > -1) {
                                runningSongs.splice(index, 1);
                            }
                            songsProcessed++

                            resolve()
                        }
                    })
                    await myPromise
                }

                songDownloaders.push(songDownloader)

            }
        }

        async function nextSong() {
            var downloader = songDownloaders.pop()
            if (!downloader) return;
            await downloader()
            nextSong()
        }

        var batch = []
        for (let index = 0; index < 10; index++) {
            batch.push(nextSong())
        }
    })
})

function tryRequire(path) {
    try {
        return require(path)
    } catch (error) {
        console.error(error)
    }
}

async function youtubeSearch(query) {
    let results = await ytsr(query, { limit: 10 }).catch((error) => {
        console.error(error)
    })
    if (!results) return;
    return results.items
}

async function getSpotifyPlaylist(id, offset, spotifyApiKey, songs = []) {
    let req = await axios.get('https://api.spotify.com/v1/playlists/' + id + "/tracks?offset=" + offset, {
        headers: {
            'Authorization': "Bearer " + spotifyApiKey,
        },
    })
    songs = songs.concat(req.data.items)
    if (req.data.next) {
        console.log(req.data.next)
        return await getSpotifyPlaylist(id, offset + 100, spotifyApiKey, songs)
    }
    return songs
}

async function generateSpotifyApiKey() {
    let request = await axios({
        url: 'https://accounts.spotify.com/api/token',
        method: 'post',
        params: {
            grant_type: 'client_credentials'
        },
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        auth: {
            username: spotify_clientid,
            password: spotify_clientsecret
        }
    })
    return request.data.access_token
}