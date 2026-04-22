package services

import (
	"fmt"
	"image"
	"image/color"
	imagedraw "image/draw"
	"image/jpeg"
	"image/png"
	"os"
	"path/filepath"
	"photobooth/config"
	"strings"

	xdraw "golang.org/x/image/draw"
)

// Koordinat slot foto di frame (sesuai dimensi frame yang kita buat)
var frameSlots = []image.Rectangle{
	{Min: image.Pt(10, 100), Max: image.Pt(590, 634)},   // slot 1
	{Min: image.Pt(10, 642), Max: image.Pt(590, 1176)},  // slot 2
	{Min: image.Pt(10, 1184), Max: image.Pt(590, 1718)}, // slot 3
}

// ComposeStripResult menggabungkan 3 foto + frame menjadi 1 file PNG
func ComposeStripResult(sessionID, frameID string, photoPaths []string, filterKey, outputPath string) error {
	if len(photoPaths) != 3 {
		return fmt.Errorf("harus ada tepat 3 foto")
	}

	// ── 1. Load frame PNG ──────────────────────────────────────────────────
	framePath := filepath.Join(config.App.StoragePath, "frames", frameID+".png")

	// frameCanvas adalah RGBA canvas untuk overlay frame
	var frameCanvas *image.RGBA
	var canvasBounds image.Rectangle

	frameImg, err := loadPNG(framePath)
	if err != nil {
		// Frame tidak ada → buat canvas cream kosong 600x1800
		canvasBounds = image.Rect(0, 0, 600, 1800)
		blank := image.NewRGBA(canvasBounds)
		fillRect(blank, canvasBounds, color.RGBA{245, 240, 232, 255})
		frameCanvas = blank
	} else {
		// Convert frame image ke RGBA agar bisa di-draw
		canvasBounds = frameImg.Bounds()
		frameCanvas = image.NewRGBA(canvasBounds)
		imagedraw.Draw(frameCanvas, canvasBounds, frameImg, canvasBounds.Min, imagedraw.Src)
	}

	// ── 2. Buat canvas output (RGBA) ──────────────────────────────────────
	output := image.NewRGBA(canvasBounds)

	// Background putih dulu
	fillRect(output, canvasBounds, color.RGBA{255, 255, 255, 255})

	// ── 3. Tempatkan tiap foto di slot yang sesuai ────────────────────────
	for i, photoPath := range photoPaths {
		if i >= len(frameSlots) {
			break
		}

		slot := frameSlots[i]

		// Pastikan slot tidak melebihi canvas
		slot = slot.Intersect(canvasBounds)
		if slot.Empty() {
			continue
		}

		// Load foto
		fullPath := filepath.Join(config.App.StoragePath, photoPath)
		photoImg, err := loadImage(fullPath)
		if err != nil {
			// Foto gagal load → isi abu
			fillRect(output, slot, color.RGBA{180, 180, 180, 255})
			continue
		}

		// Resize & crop foto agar pas di slot (cover mode)
		slotW := slot.Max.X - slot.Min.X
		slotH := slot.Max.Y - slot.Min.Y
		resized := resizeCover(photoImg, slotW, slotH)
		applyStripFilter(resized, filterKey)

		// Paste ke output di posisi slot
		imagedraw.Draw(output, slot, resized, image.Point{0, 0}, imagedraw.Src)
	}

	// ── 4. Overlay frame RGBA di atas foto ────────────────────────────────
	// Frame PNG area transparan (alpha=0) = foto terlihat
	// Frame PNG area solid = frame terlihat menutupi foto
	imagedraw.Draw(output, canvasBounds, frameCanvas, canvasBounds.Min, imagedraw.Over)

	// ── 5. Simpan hasil ke file PNG ───────────────────────────────────────
	if err := os.MkdirAll(filepath.Dir(outputPath), 0755); err != nil {
		return fmt.Errorf("gagal buat direktori output: %w", err)
	}

	f, err := os.Create(outputPath)
	if err != nil {
		return fmt.Errorf("gagal buat file output: %w", err)
	}
	defer f.Close()

	return png.Encode(f, output)
}

func applyStripFilter(img *image.RGBA, filterKey string) {
	if img == nil {
		return
	}

	key := strings.ToLower(strings.TrimSpace(filterKey))
	if key == "" || key == "none" {
		return
	}

	b := img.Bounds()
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			r16, g16, b16, a16 := img.At(x, y).RGBA()
			if a16 == 0 {
				continue
			}

			r := float64(r16 >> 8)
			g := float64(g16 >> 8)
			bl := float64(b16 >> 8)

			switch key {
			case "warm":
				r = r*1.10 + 8
				g = g * 1.02
				bl = bl*0.92 - 4

			case "cool":
				r = r * 0.93
				g = g * 1.02
				bl = bl*1.10 + 6

			case "mono":
				gray := 0.299*r + 0.587*g + 0.114*bl
				r, g, bl = gray*1.04, gray*1.04, gray*1.04

			case "vivid":
				r, g, bl = satBoost(r, g, bl, 1.24)
				r, g, bl = contrast(r, g, bl, 1.08)

			case "soft":
				r, g, bl = satBoost(r, g, bl, 0.90)
				r, g, bl = contrast(r, g, bl, 0.90)
				r += 8
				g += 8
				bl += 8

			case "sepia":
				nr := 0.393*r + 0.769*g + 0.189*bl
				ng := 0.349*r + 0.686*g + 0.168*bl
				nb := 0.272*r + 0.534*g + 0.131*bl
				r, g, bl = nr, ng, nb

			case "film":
				r, g, bl = satBoost(r, g, bl, 0.90)
				r, g, bl = contrast(r, g, bl, 0.94)
				r += 10
				g += 8
				bl += 6

			case "dramatic":
				r, g, bl = contrast(r, g, bl, 1.22)
				r, g, bl = satBoost(r, g, bl, 1.08)
				r -= 6
				g -= 6
				bl -= 6

			case "pastel":
				r, g, bl = satBoost(r, g, bl, 0.82)
				r, g, bl = contrast(r, g, bl, 0.92)
				r += 14
				g += 14
				bl += 14

			case "retro":
				r = r*1.08 + 6
				g = g * 1.02
				bl = bl*0.88 - 3
				r, g, bl = contrast(r, g, bl, 1.04)

			default:
				continue
			}

			img.Set(x, y, color.RGBA{
				R: clampByte(r),
				G: clampByte(g),
				B: clampByte(bl),
				A: uint8(a16 >> 8),
			})
		}
	}
}

func satBoost(r, g, b float64, amount float64) (float64, float64, float64) {
	l := 0.299*r + 0.587*g + 0.114*b
	return l + (r-l)*amount, l + (g-l)*amount, l + (b-l)*amount
}

func contrast(r, g, b float64, amount float64) (float64, float64, float64) {
	return (r-128)*amount + 128, (g-128)*amount + 128, (b-128)*amount + 128
}

func clampByte(v float64) uint8 {
	if v < 0 {
		return 0
	}
	if v > 255 {
		return 255
	}
	return uint8(v)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

func loadPNG(path string) (image.Image, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return png.Decode(f)
}

func loadImage(path string) (image.Image, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	ext := strings.ToLower(filepath.Ext(path))
	if ext == ".png" {
		return png.Decode(f)
	}
	return jpeg.Decode(f)
}

func fillRect(img *image.RGBA, r image.Rectangle, c color.RGBA) {
	r = r.Intersect(img.Bounds())
	imagedraw.Draw(img, r, &image.Uniform{C: c}, image.Point{}, imagedraw.Src)
}

// resizeCover resize + crop gambar agar pas mengisi (w x h) tanpa distorsi
func resizeCover(src image.Image, w, h int) *image.RGBA {
	srcB := src.Bounds()
	srcW := srcB.Dx()
	srcH := srcB.Dy()

	if srcW == 0 || srcH == 0 {
		dst := image.NewRGBA(image.Rect(0, 0, w, h))
		fillRect(dst, dst.Bounds(), color.RGBA{180, 180, 180, 255})
		return dst
	}

	// Scale cover: sisi pendek menutupi target, lalu crop ke tengah.
	if srcW*h >= srcH*w {
		scaledW := srcW * h / srcH
		scaled := image.NewRGBA(image.Rect(0, 0, scaledW, h))
		xdraw.CatmullRom.Scale(scaled, scaled.Bounds(), src, srcB, imagedraw.Src, nil)

		startX := (scaledW - w) / 2
		crop := image.Rect(startX, 0, startX+w, h)
		dst := image.NewRGBA(image.Rect(0, 0, w, h))
		imagedraw.Draw(dst, dst.Bounds(), scaled, crop.Min, imagedraw.Src)
		return dst
	}

	scaledH := srcH * w / srcW
	scaled := image.NewRGBA(image.Rect(0, 0, w, scaledH))
	xdraw.CatmullRom.Scale(scaled, scaled.Bounds(), src, srcB, imagedraw.Src, nil)

	startY := (scaledH - h) / 2
	crop := image.Rect(0, startY, w, startY+h)
	dst := image.NewRGBA(image.Rect(0, 0, w, h))
	imagedraw.Draw(dst, dst.Bounds(), scaled, crop.Min, imagedraw.Src)
	return dst
}
