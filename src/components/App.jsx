/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {useRef, useState, useCallback, useEffect} from 'react'
import c from 'clsx'
import {
  snapPhoto,
  deletePhoto,
  makeGif,
  hideGif
} from '../lib/actions'
import useStore from '../lib/store'
import imageData from '../lib/imageData'

const canvas = document.createElement('canvas')
const ctx = canvas.getContext('2d')

export default function App() {
  const photos = useStore.use.photos()
  const gifInProgress = useStore.use.gifInProgress()
  const gifUrl = useStore.use.gifUrl()
  const [videoActive, setVideoActive] = useState(false)
  const [didInitVideo, setDidInitVideo] = useState(false)
  const [focusedId, setFocusedId] = useState(null)
  const [didJustSnap, setDidJustSnap] = useState(false)
  const videoRef = useRef(null)

  const [activeDragId, setActiveDragId] = useState(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [stickers, setStickers] = useState([])

  useEffect(() => {
    setStickers([])
  }, [focusedId])

  useEffect(() => {
    if (!activeDragId) return
    const handleUp = () => setActiveDragId(null)
    const handleMove = (e) => {
      const container = document.querySelector('.focusedPhoto')
      if (!container) return
      const rect = container.getBoundingClientRect()
      
      const clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : e.clientX
      const clientY = e.touches && e.touches.length > 0 ? e.touches[0].clientY : e.clientY

      let newX = ((clientX - rect.left - dragOffset.x) / rect.width) * 100
      let newY = ((clientY - rect.top - dragOffset.y) / rect.height) * 100
      
      newX = Math.max(0, Math.min(100, newX))
      newY = Math.max(0, Math.min(100, newY))
      
      if (activeDragId) {
        setStickers(prev => prev.map(s => s.id === activeDragId ? { ...s, x: newX, y: newY } : s))
      }
    }
    
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    window.addEventListener('touchmove', handleMove, { passive: false })
    window.addEventListener('touchend', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      window.removeEventListener('touchmove', handleMove)
      window.removeEventListener('touchend', handleUp)
    }
  }, [activeDragId, dragOffset])

  const startVideo = async () => {
    setDidInitVideo(true)
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {width: {ideal: 1920}, height: {ideal: 1080}},
      audio: false,
      facingMode: {ideal: 'user'}
    })
    setVideoActive(true)
    videoRef.current.srcObject = stream

    const {width, height} = stream.getVideoTracks()[0].getSettings()
    const squareSize = Math.min(width, height)
    canvas.width = squareSize
    canvas.height = squareSize
  }

  const takePhoto = () => {
    const video = videoRef.current
    const {videoWidth, videoHeight} = video
    const squareSize = canvas.width
    const sourceSize = Math.min(videoWidth, videoHeight)
    const sourceX = (videoWidth - sourceSize) / 2
    const sourceY = (videoHeight - sourceSize) / 2

    ctx.clearRect(0, 0, squareSize, squareSize)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(
      video,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      -squareSize,
      0,
      squareSize,
      squareSize
    )
    snapPhoto(canvas.toDataURL('image/jpeg'))
    setDidJustSnap(true)
    setTimeout(() => setDidJustSnap(false), 1000)
  }

  const handleUploadPhoto = useCallback((e) => {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        const {width, height} = img
        const squareSize = 1080
        if(canvas.width !== squareSize) {
          canvas.width = squareSize
          canvas.height = squareSize
        }
        
        const sourceSize = Math.min(width, height)
        const sourceX = (width - sourceSize) / 2
        const sourceY = (height - sourceSize) / 2

        ctx.clearRect(0, 0, squareSize, squareSize)
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.drawImage(
          img,
          sourceX,
          sourceY,
          sourceSize,
          sourceSize,
          0,
          0,
          squareSize,
          squareSize
        )
        snapPhoto(canvas.toDataURL('image/jpeg'))
        setDidJustSnap(true)
        setTimeout(() => setDidJustSnap(false), 1000)
      }
      img.src = event.target.result
    }
    reader.readAsDataURL(file)
    e.target.value = null
  }, [])

  const downloadImage = () => {
    if (gifUrl) {
      const a = document.createElement('a')
      a.href = gifUrl
      a.download = 'comicify.gif'
      a.click()
      return
    }

    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      const exportCanvas = document.createElement('canvas')
      exportCanvas.width = img.width
      exportCanvas.height = img.height
      const exportCtx = exportCanvas.getContext('2d')
      exportCtx.drawImage(img, 0, 0)
      
      if (stickers && stickers.length > 0) {
        stickers.forEach(sticker => {
          const sx = (sticker.x / 100) * exportCanvas.width
          const sy = (sticker.y / 100) * exportCanvas.height
          const stickerScale = sticker.scale || 1
          const stickerFontSize = Math.max(40, Math.floor(exportCanvas.height * 0.08)) * stickerScale
          
          exportCtx.save()
          exportCtx.translate(sx, sy)
          exportCtx.rotate(sticker.rotate * Math.PI / 180)
          exportCtx.font = `${stickerFontSize}px Bangers, "Comic Sans MS", sans-serif`
          exportCtx.fillStyle = "#ffcc00"
          exportCtx.textAlign = "center"
          exportCtx.textBaseline = "middle"
          
          exportCtx.lineWidth = Math.max(6, Math.floor(exportCanvas.width * 0.008))
          exportCtx.strokeStyle = "black"
          
          exportCtx.strokeText(sticker.text, 0, 0)
          exportCtx.fillText(sticker.text, 0, 0)
          exportCtx.restore()
        })
      }
      
      const a = document.createElement('a')
      a.href = exportCanvas.toDataURL('image/jpeg')
      a.download = 'comicify.jpg'
      a.click()
    }
    img.src = imageData.outputs[focusedId]
  }

  return (
    <main>
      <div
        className="video"
        onClick={() => {
          hideGif()
          setFocusedId(null)
        }}
      >
        <video
          ref={videoRef}
          muted
          autoPlay
          playsInline
          disablePictureInPicture
        />
        {didJustSnap && <div className="flash" />}
        {!videoActive && (
          <div className="startButton" style={{ cursor: 'pointer' }} onClick={startVideo}>
            <h1 className="appTitle">💥 Comicify</h1>
            <p>{didInitVideo ? 'One sec…' : 'Tap anywhere to start webcam'}</p>
            <p style={{ marginTop: '10px' }}>or</p>
            <label className="button" style={{ background: 'rgba(255,255,255,0.2)', marginTop: '5px' }} onClick={e => e.stopPropagation()}>
              <span className="icon">upload</span> Upload Photo
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUploadPhoto} />
            </label>
          </div>
        )}

        <div className="videoControls">
          {videoActive && (
            <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
              <button onClick={takePhoto} className="shutter">
                <span className="icon">camera</span>
              </button>
              <label className="shutter" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
                <span className="icon">upload</span>
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUploadPhoto} />
              </label>
            </div>
          )}
          </div>

        {(focusedId || gifUrl) && (
          <div className="focusedPhoto" onClick={e => e.stopPropagation()}>
            <button
              className="circleBtn"
              style={{
                left: 0,
                right: 'unset',
                translate: '-50% -50%',
                background: '#fff',
                color: '#000'
              }}
              onClick={() => {
                hideGif()
                setFocusedId(null)
              }}
            >
              <span className="icon">close</span>
            </button>
            <img
              src={gifUrl || imageData.outputs[focusedId]}
              alt="photo"
              draggable={false}
            />
            
            {!gifUrl && stickers.map(sticker => (
              <div
                key={sticker.id}
                className="comicSticker"
                style={{
                  position: 'absolute',
                  left: `${sticker.x}%`,
                  top: `${sticker.y}%`,
                  transform: `translate(-50%, -50%) scale(${sticker.scale}) rotate(${sticker.rotate}deg)`,
                  fontFamily: '"Bangers", "Comic Sans MS", sans-serif',
                  fontSize: '60px',
                  color: '#ffcc00',
                  textShadow: '-3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 3px 3px 0 #000, 4px 4px 0 #000',
                  cursor: 'grab',
                  userSelect: 'none',
                  zIndex: 25,
                  whiteSpace: 'nowrap'
                }}
                onMouseDown={(e) => {
                  setActiveDragId(sticker.id)
                  const rect = e.currentTarget.parentElement.getBoundingClientRect()
                  setDragOffset({
                    x: e.clientX - rect.left - (sticker.x / 100) * rect.width,
                    y: e.clientY - rect.top - (sticker.y / 100) * rect.height
                  })
                }}
                onTouchStart={(e) => {
                  setActiveDragId(sticker.id)
                  const rect = e.currentTarget.parentElement.getBoundingClientRect()
                  setDragOffset({
                    x: e.touches[0].clientX - rect.left - (sticker.x / 100) * rect.width,
                    y: e.touches[0].clientY - rect.top - (sticker.y / 100) * rect.height
                  })
                }}
              >
                {sticker.text}
                <div className="stickerControls" onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
                  <button onClick={() => setStickers(prev => prev.map(s => s.id === sticker.id ? {...s, scale: s.scale + 0.2} : s))}>+</button>
                  <button onClick={() => setStickers(prev => prev.map(s => s.id === sticker.id ? {...s, scale: s.scale - 0.2} : s))}>-</button>
                  <button onClick={() => setStickers(prev => prev.filter(s => s.id !== sticker.id))}>×</button>
                </div>
              </div>
            ))}

            <button className="button downloadButton" onClick={downloadImage}>
              Download
            </button>
          </div>
        )}

        {focusedId && !gifUrl && (
          <div className="overlayInputContainer" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '5px', justifyContent: 'center', width: '100%', alignItems: 'center' }}>
              <span style={{ fontWeight: 'bold', fontSize: '18px', marginRight: '5px', flexShrink: 0 }}>ADD:</span>
              {['Pow!', 'Zap!', 'Wham!', 'Boom!', 'Crash!'].map((text, i) => (
                <button
                   key={i}
                   className="stickerButton"
                   style={{ background: '#ffcc00', border: '3px solid #000', padding: '6px 14px', borderRadius: '8px', fontWeight: 'bold', fontFamily: '"Bangers", "Comic Sans MS", sans-serif', fontSize: '22px', cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '2px 2px 0 #000' }}
                   onClick={() => setStickers(prev => [...prev, { id: Date.now() + i, text, x: 50, y: 50, scale: 1, rotate: Math.floor(Math.random() * 30 - 15) }])}
                >
                  {text}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="results">
        <ul>
          {photos.length
            ? photos.map(({id, mode, isBusy}) => (
                <li className={c({isBusy})} key={id}>
                  <button
                    className="circleBtn deleteBtn"
                    onClick={() => {
                      deletePhoto(id)
                      if (focusedId === id) {
                        setFocusedId(null)
                      }
                    }}
                  >
                    <span className="icon">delete</span>
                  </button>
                  <button
                    className="photo"
                    onClick={() => {
                      if (!isBusy) {
                        setFocusedId(id)
                        hideGif()
                      }
                    }}
                  >
                    <img
                      src={
                        isBusy ? imageData.inputs[id] : imageData.outputs[id]
                      }
                      draggable={false}
                    />
                  </button>
                </li>
              ))
            : videoActive && (
                <li className="empty" key="empty">
                  <p>
                    👉 <span className="icon">camera</span>
                  </p>
                  Snap a photo to get started.
                </li>
              )}
        </ul>
        {photos.filter(p => !p.isBusy).length > 0 && (
          <button
            className="button makeGif"
            onClick={makeGif}
            disabled={gifInProgress}
          >
            {gifInProgress ? 'One sec…' : 'Make GIF!'}
          </button>
        )}
      </div>
    </main>
  )
}
