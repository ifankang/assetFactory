export async function removeBackground(imageBuffer: Buffer): Promise<Buffer> {
	// Dynamically import to avoid loading GLib native DLLs at startup
	const { removeBackground: removeBg } = await import('@imgly/background-removal-node');

	const inputBlob = new Blob([new Uint8Array(imageBuffer)], { type: 'image/png' });

	// Run background removal
	const resultBlob: Blob = await removeBg(inputBlob, {
		output: {
			format: 'image/png',
			quality: 1
		}
	});

	// Convert result Blob → Node Buffer
	const arrayBuffer = await resultBlob.arrayBuffer();
	return Buffer.from(arrayBuffer);
}
