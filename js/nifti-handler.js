/**
 * NIfTI Handler Module
 * Parses NIfTI files (.nii, .nii.gz), extracts volume metadata.
 * Uses nifti-reader-js library.
 */
const NiftiHandler = (() => {
    'use strict';

    const DATATYPE_NAMES = {
        0: 'Unknown',
        1: 'Binary (1-bit)',
        2: 'uint8',
        4: 'int16',
        8: 'int32',
        16: 'float32',
        32: 'complex64',
        64: 'float64',
        128: 'RGB24',
        256: 'int8',
        512: 'uint16',
        768: 'uint32',
        1024: 'int64',
        1280: 'uint64',
        1536: 'float128',
        1792: 'complex128',
        2048: 'complex256'
    };

    /**
     * Parse a NIfTI file from an ArrayBuffer.
     * Handles both .nii and .nii.gz (compressed) files.
     * Returns extracted volume metadata.
     */
    function parseFile(arrayBuffer, filename) {
        let data = arrayBuffer;

        // Detect and decompress .nii.gz
        const isCompressed = nifti.isCompressed(data);
        if (isCompressed) {
            data = nifti.decompress(data);
        }

        if (!nifti.isNIFTI(data)) {
            throw new Error('File is not a valid NIfTI format.');
        }

        const header = nifti.readHeader(data);

        const numDims = header.dims[0];
        const dims = header.dims.slice(1, numDims + 1);
        const pixDims = header.pixDims.slice(1, numDims + 1);
        const datatypeCode = header.datatypeCode;
        const datatypeName = DATATYPE_NAMES[datatypeCode] || 'Unknown (' + datatypeCode + ')';

        return {
            filename,
            compressed: isCompressed,
            numDims,
            dims,
            pixDims,
            datatypeCode,
            datatypeName,
            numBitsPerVoxel: header.numBitsPerVoxel,
            description: (header.description || '').replace(/\0/g, '').trim(),
            voxOffset: header.vox_offset
        };
    }

    return {
        parseFile
    };
})();
