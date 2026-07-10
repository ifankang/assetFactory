export async function splitImageGrid(
	imageBuffer: Buffer,
	rows: number,
	cols: number
): Promise<Buffer[]> {
	// Dynamically import sharp to avoid loading GLib native DLLs at startup
	const { default: sharp } = await import('sharp');

	const metadata = await sharp(imageBuffer).metadata();

	if (!metadata.width || !metadata.height) {
		throw new Error('Unable to read image dimensions from metadata');
	}

	const cellWidth = Math.floor(metadata.width / cols);
	const cellHeight = Math.floor(metadata.height / rows);

	const cells: Buffer[] = [];

	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < cols; col++) {
			const left = col * cellWidth;
			const top = row * cellHeight;

			const cell = await sharp(imageBuffer)
				.extract({
					left,
					top,
					width: cellWidth,
					height: cellHeight
				})
				.png()
				.toBuffer();

			cells.push(cell);
		}
	}

	return cells;
}
