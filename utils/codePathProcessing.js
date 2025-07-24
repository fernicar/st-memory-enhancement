// Manually define the relative path of the current file
const ROOT_TO_THIS_FILE_PATH = './utils/utility.js';

export function getRelativePositionOfCurrentCode(deep = 1){
    const currentFileAbsolutePath = getStackTracePath(0);
    // Get the file name and line number of the file using this function from the stack
    const targetAbsolutePath = getStackTracePath(deep);

    // Use a regular expression to remove the :line:column part from the end of targetAbsolutePath
    const cleanTargetAbsolutePath = targetAbsolutePath.replace(/:(\d+):(\d+)$/, '');

    // Get the absolute path of the root directory
    const rootDirectoryAbsolutePath = getRootDirectoryAbsolutePath(currentFileAbsolutePath);
    const targetBiasWithRoot = compareRelativePath(rootDirectoryAbsolutePath, targetAbsolutePath); // Still use targetAbsolutePath with line number to calculate the relative path
    // Get the position of the target file code in the file
    const targetCodePosition = getTargetCodePosition(targetAbsolutePath);

    const r = {
        codeAbsolutePath: targetAbsolutePath, // Use the cleaned absolute path
        codeFileAbsolutePath: cleanTargetAbsolutePath, // Use the cleaned absolute path
        codeFileRelativePathWithRoot: `./${targetBiasWithRoot}`,
        codePositionInFile: targetCodePosition
    }
    // console.log(r);

    return r;
}

export function getTargetCodePosition(absoluteFilePath) {
    if (!absoluteFilePath) {
        return null;
    }
    const parts = absoluteFilePath.split(':');
    if (parts.length >= 3) {
        return `${parts[parts.length - 2]}:${parts[parts.length - 1]}`;
    }
    return null; // Or handle cases where line and column are not found
}


export function getRootDirectoryAbsolutePath(absoluteFilePath) {
    try {
        const url = new URL(absoluteFilePath);
        const pathname = url.pathname;
        let pathSegments = pathname.split('/').filter(Boolean); // Get the path segment array

        const relativePathSegments = ROOT_TO_THIS_FILE_PATH.split('/').filter(Boolean);
        // Remove the file name part from ROOT_TO_THIS_FILE_PATH, keeping only the directory part
        relativePathSegments.pop(); // Assume the last one is the file name

        // Calculate the number of directory levels to go up
        const upLevels = relativePathSegments.length;

        // Remove the corresponding number of directory segments from the end of pathSegments to get the path segment of the root directory
        pathSegments = pathSegments.slice(0, pathSegments.length - upLevels);

        const rootPath = '/' + pathSegments.join('/');
        return `${url.protocol}//${url.host}${rootPath}`;

    } catch (error) {
        console.error('Error parsing URL:', error);
        return null;
    }
}

export function getStackTracePath(location = 0) {
    const afterLocation = location + 2;
    const stack = new Error().stack;
    return extractPath(stack.split('\n')[afterLocation].trim());
}

export function extractPath(filePath) {
    if (!filePath) {
        return null; // Or "", handle empty input according to your needs
    }
    const match = filePath.match(/\((https?:\/\/[^\)]+)\)/);
    if (match && match[1]) {
        return match[1];
    }
    return null; // Or "", if no matching path is found
}

export function compareRelativePath(from, to) {
    // 1. Parse the URL and extract the path, removing the line and column numbers
    const fromPath = new URL(from).pathname.split(':')[0]; // Remove the ':line:column' part
    const toPath = new URL(to).pathname.split(':')[0];

    // 2. Split the path
    const fromSegments = fromPath.split('/').filter(Boolean); // filter(Boolean) removes empty strings
    const toSegments = toPath.split('/').filter(Boolean);

    // 3. Find the length of the common path prefix
    let commonPrefixLength = 0;
    while (
        commonPrefixLength < fromSegments.length &&
        commonPrefixLength < toSegments.length &&
        fromSegments[commonPrefixLength] === toSegments[commonPrefixLength]
        ) {
        commonPrefixLength++;
    }

    // 4. Build the relative path
    // const upLevels = fromSegments.length - commonPrefixLength; // Original calculation method
    const upLevels = Math.max(0, fromSegments.length - commonPrefixLength - 1); // Corrected calculation method
    const relativeSegments = [];

    // Add '..' to go up
    for (let i = 0; i < upLevels; i++) {
        relativeSegments.push('..');
    }

    // Add the remaining part of the target path after removing the common prefix
    for (let i = commonPrefixLength; i < toSegments.length; i++) {
        relativeSegments.push(toSegments[i]);
    }

    // If the relative path is empty, it means they are in the same directory, return './' or the file name
    if (relativeSegments.length === 0) {
        const fromFilename = fromSegments[fromSegments.length - 1];
        const toFilename = toSegments[toSegments.length - 1];
        if (fromFilename === toFilename) {
            return './'; // The two paths are exactly the same
        } else {
            return './' + toFilename; // In the same directory, but the file names are different, return './filename'
        }
    }

    return relativeSegments.join('/');
}
