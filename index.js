const ytdl = require('ytdl-core');
const readline = require('readline');
const ffmpeg = require('fluent-ffmpeg');
const axios = require("axios");
const ytsr = require('ytsr');
const fs = require('fs')
const { spotify_clientid, spotify_clientsecret } = require('./config.json');
const exclude = ["official video", "official music video", "official hd video", "video"]
var spotifyApiKey

//const musicPath = "./songs/Ethans Music"
const musicPath = "./songs"

readline.cursorTo(process.stdout, 0, 0)
readline.clearScreenDown(process.stdout);

var lines = []

var songDownloaders = []

process.on('SIGINT', function () {
    console.log("Caught interrupt signal");

    process.stdout.write('\u001B[?25h');
    process.exit();
});

generateSpotifyApiKey().then(spotifyApiKey => {
    console.log("Refreshed Spotify Api Key!") //https://open.spotify.com/playlist/2S2ESTaSfJEev1LQjam3mV   //MY PLAYLIST
    //https://open.spotify.com/playlist/1uC9BAreJUHMmJuaJQgg6h       //MOMS PLAYLIST
    getSpotifyPlaylist("1uC9BAreJUHMmJuaJQgg6h", 0, spotifyApiKey).then(async items => {

        console.log("TOTAL: " + items.length)
        var runningSongs = []

        var existingSongs = fs.readdirSync(musicPath).filter(s => s.endsWith(".mp3"))

        var convertedSongsNames = items.map(i => `${i.track.name.replaceAll("\"", "").replaceAll("/", "")}.mp3`)

        var songsProcessed = 0
        existingSongs.forEach(existingSong => {
            if (!convertedSongsNames.find(s => s == existingSong)) {
                console.log(`${existingSong} can no longer be found in the spotify playlist!`)
                console.log("Deleting It!")
                fs.unlinkSync(musicPath + "/" + existingSong)
            }
        })

        //console.log(JSON.stringify(existingSongs.sort()))
        //console.log(JSON.stringify(convertedSongsNames.sort()))

        process.stdout.write('\u001B[?25l');

        var updateScreen = function () {
            readline.cursorTo(process.stdout, 0, 0)

            process.stdout.write("\r\x1b[K")

            console.log(`Songs Done: ${songsProcessed}/${items.length}`)
            process.stdout.write("\r\x1b[K")



            for (const song of runningSongs) {
                //console.log(song.progress)
                process.stdout.clearLine(1);
                process.stdout.write(`${song.name}: ${(song?.progress?.targetSize / (song?.progress?.resultSize / 1000) * 100 || 0).toFixed(2)}%\n`)
            }
            //console.log(songsProcessed == items.length)
            if (songsProcessed == items.length) {
                readline.cursorTo(process.stdout, 0, 2)
                readline.clearScreenDown(process.stdout);
                console.log("DONE!")
                //clearInterval(updateScreen)
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

                    let thing = await ytdl.filterFormats(info.formats, 'audioonly')

                    const myPromise = new Promise((resolve, reject) => {
                        //console.log(item.track.name)
                        runningSongs.push({ name: item.track.name, id: item.id })
                        //console.log(runningSongs)
                        //console.log("RUN FFMPEG!")
                        ffmpeg()
                            .input(stream)
                            .audioBitrate(128)
                            .addOutputOption('-metadata', 'title=' + item.track.name)
                            .addOutputOption('-metadata', 'artist=' + item.track.artists.map(a => a.name).join(", "))
                            .on('progress', p => {
                                //console.log(runningSongs)
                                var song = runningSongs.find(s => s.id == item.id)
                                p.resultSize = thing[0].contentLength
                                song.progress = p
                            })
                            .save(musicPath + `/${item.track.name.replaceAll("\"", "").replaceAll("/", "")}.mp3`)
                            .on('end', () => {
                                finallyDone()
                            }).on('error', (e) => {
                                console.log(e)
                                finallyDone()
                            })
                        function finallyDone() {
                            const index = runningSongs.findIndex(s => s.id == item.id);
                            if (index > -1) { // only splice array when item is found
                                runningSongs.splice(index, 1); // 2nd parameter means remove one item only
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

        console.log(songDownloaders.length)

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

        /* var tracksDone = 0
        var tracksDownloaded = 0
        readline.cursorTo(process.stdout, 0, line)
        readline.clearScreenDown(process.stdout)
        for (const item of items) {
            var line = conCurrentDownloads + 1
            tracksDone = tracksDone + 1
            if (existingSongs.includes(item.track.name.replaceAll("\"", "").replaceAll("/", "") + ".mp3")) {
                //console.log(item.track.name + `: Has already been downloaded! ${tracksDone}/${items.length}`)
                tracksDownloaded++
            } else {
                const filters1 = await ytsr.getFilters(item.track.name + " " + item.track.artists.map(a => a.name).join(" "));
                const filter1 = filters1.get('Type').get('Video');
                var thingPromise = youtubeSearch(filter1.url).then(async results => {
                    var result = results.find(r => exclude.some(v => !r.title.toLowerCase().includes(v)))
                    if (!result) {
                        console.log("Cannot find: " + item.track.name + " " + item.track.artists.map(a => a.name).join(" "))
                    }

                    if (!result) return;

                    if (result.url) {

                        let stream = ytdl(result.url, {
                            quality: 'highestaudio',
                        })
                        let start = Date.now();
                        //console.log(item.track.album.images[0].url)
                        const myPromise = new Promise((resolve, reject) => {
                            conCurrentDownloads++
                            ffmpeg()
                                .input(stream)
                                .audioBitrate(128)
                                .addOutputOption('-metadata', 'title=' + item.track.name)
                                .addOutputOption('-metadata', 'artist=' + item.track.artists.map(a => a.name).join(", "))
                                .save(musicPath+`/${item.track.name.replaceAll("\"", "").replaceAll("/", "")}.mp3`)
                                .on('progress', p => {

                                    if (line > conCurrentDownloads + 1) line = conCurrentDownloads + 1
                                    lines[line] = `${p.targetSize}kb downloaded`
                                    redraw()
                                })
                                .on('end', () => {
                                    tracksDownloaded++
                                    //console.log(`\ndone, ${item.track.name} - ${(Date.now() - start) / 1000}s   ${tracksDownloaded}/${items.length}  ${line}`);
                                    if (line > conCurrentDownloads + 1) line = conCurrentDownloads + 1
                                    readline.cursorTo(process.stdout, 0, line)
                                    readline.clearLine()
                                    process.stdout.write(`done, ${item.track.name} - ${(Date.now() - start) / 1000}s   ${tracksDownloaded}/${items.length}  ${line}`)
                                    conCurrentDownloads--
                                    //console.log(conCurrentDownloads)
                                    resolve()
                                }).on('error', (e) => {
                                    console.log(e)
                                    resolve()
                                })
                        })
                        await myPromise
                    }
                })

                //if (conCurrentDownloads > 2) await thingPromise

            }
        } */
    })
})


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