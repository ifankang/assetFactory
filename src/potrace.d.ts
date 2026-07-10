declare module 'potrace' {
	export interface PosterizeOptions {
		steps?: number | number[];
		threshold?: number;
		blackOnWhite?: boolean;
		color?: string;
		background?: string;
		turnPolicy?: string;
		turdSize?: number;
		alphaMax?: number;
		optCurve?: boolean;
		optTolerance?: number;
	}

	export interface TraceOptions {
		threshold?: number;
		blackOnWhite?: boolean;
		color?: string;
		background?: string;
		turnPolicy?: string;
		turdSize?: number;
		alphaMax?: number;
		optCurve?: boolean;
		optTolerance?: number;
	}

	export function posterize(
		image: Buffer | string,
		options: PosterizeOptions,
		callback: (err: Error | null, svg: string) => void
	): void;

	export function trace(
		image: Buffer | string,
		options: TraceOptions,
		callback: (err: Error | null, svg: string) => void
	): void;
}
