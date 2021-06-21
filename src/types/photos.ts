export interface ImageList {
	src : string,
	height : number,
	artist : string,
	description : string
}

export interface ImageData {
	imageArray : ImageList[]
}

export interface ColumnInterface {
	key : number,
	images : ImageList[]
}