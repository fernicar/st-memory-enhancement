import { USER } from "../core/manager.js";

/**
 * Replace the user tag in the string
 */
export function replaceUserTag(str) {
    if (str == null) return ''; // Handle null or undefined
    if (typeof str !== 'string') {
        console.warn('Non-string input:', str);
        str = String(str); // Force conversion to string
    }
    return str.replace(/<user>/g, USER.getContext().name1);
}

/**
 * Replace commas in a cell with /
 * @param {string | number} cell
 * @returns The processed cell value
 */
function handleCellValue(cell) {
    if (typeof cell === 'string') {
        return cell.replace(/,/g, "/")
    } else if (typeof cell === 'number') {
        return cell
    }
    return ''
}

/**
 * Truncate the content after the last parenthesis
 * @param {string} str
 * @returns {string} The processed string
 */
export function truncateAfterLastParenthesis(str) {
    const lastIndex = str.lastIndexOf(')');
    if (lastIndex !== -1) {
        return str.slice(0, lastIndex).trim();
    }
    return str.trim();
}

/**
 * Parse a string dictionary into an object
 * @param {*} str
 * @returns object
 */
export function parseLooseDict(str) {
    const result = {};
    const content = str.replace(/\s+/g, '').replace(/\\"/g, '"').slice(1, -1);
    console.log("Parsing",content)
    let i = 0;
    const len = content.length;

    while (i < len) {
        // Read key
        let key = '';
        while (i < len && content[i] !== ':') {
            key += content[i++];
        }
        key = key.trim().replace(/^["']|["']$/g, ''); // Remove quotes
        i++; // Skip colon

        // Read value
        let value = '';
        let quoteChar = null;
        let inString = false;

        // Judge the starting quote (can be absent)
        if (content[i] === '"' || content[i] === "'") {
            quoteChar = content[i];
            inString = true;
            i++;
        }

        while (i < len) {
            const char = content[i];

            if (inString) {
                // If nested quotes are encountered, replace them with another kind
                if (char === quoteChar) {
                    if (content[i + 1] === ','||content[i + 1] == null) {
                        i++; // Skip the closing quote
                        break;
                    } else {
                        value += char === '"' ? "'" : '"'
                        i++;
                        continue;
                    }
                }

                value += char;
            } else {
                // Unquoted string, ends with a comma
                if (char === ',') break;
                value += char;
            }

            i++;
        }

        result[key] = value.trim().replace(/,/g, '/'); // Replace commas

        // Skip separators and spaces
        while (i < len && (content[i] === ',' || content[i] === ' ')) {
            i++;
        }
    }
    console.log('Parsed object:', result);

    return result;
}

/**
 * Manually parse a pure JSON string, handling nested quotes
 * @param {string} jsonStr - The JSON string
 * @returns {any} The parsed object
 */
export function parseManualJson(jsonStr) {
    if (!jsonStr || typeof jsonStr !== 'string') {
        throw new Error('Input must be a valid string');
    }

    const str = jsonStr.trim();
    let index = 0;

    function parseValue() {
        skipWhitespace();
        
        const char = str[index];
        
        if (char === '{') {
            return parseObject();
        } else if (char === '[') {
            return parseArray();
        } else if (char === '"' || char === "'") {
            return parseString();
        } else if (char === 't' || char === 'f') {
            return parseBoolean();
        } else if (char === 'n') {
            return parseNull();
        } else if (char === '-' || (char >= '0' && char <= '9')) {
            return parseNumber();
        } else {
            throw new Error(`Unexpected character '${char}' at position ${index}`);
        }
    }

    function parseObject() {
        const obj = {};
        index++; // Skip '{'
        skipWhitespace();

        if (str[index] === '}') {
            index++; // Skip '}'
            return obj;
        }

        while (index < str.length) {
            // Parse key
            const key = parseString();
            skipWhitespace();

            if (str[index] !== ':') {
                throw new Error(`Expected ':' at position ${index}`);
            }
            index++; // Skip ':'
            skipWhitespace();

            // Parse value
            const value = parseValue();
            obj[key] = value;

            skipWhitespace();

            if (str[index] === '}') {
                index++; // Skip '}'
                break;
            } else if (str[index] === ',') {
                index++; // Skip ','
                skipWhitespace();
            } else {
                throw new Error(`Expected ',' or '}' at position ${index}`);
            }
        }

        return obj;
    }

    function parseArray() {
        const arr = [];
        index++; // Skip '['
        skipWhitespace();

        if (str[index] === ']') {
            index++; // Skip ']'
            return arr;
        }

        while (index < str.length) {
            const value = parseValue();
            arr.push(value);

            skipWhitespace();

            if (str[index] === ']') {
                index++; // Skip ']'
                break;
            } else if (str[index] === ',') {
                index++; // Skip ','
                skipWhitespace();
            } else {
                throw new Error(`Expected ',' or ']' at position ${index}`);
            }
        }

        return arr;
    }

    function parseString() {
        const quoteChar = str[index]; // '"' or "'"
        if (quoteChar !== '"' && quoteChar !== "'") {
            throw new Error(`Expected a quote at position ${index}`);
        }

        index++; // Skip the starting quote
        let result = '';

        while (index < str.length) {
            const char = str[index];

            if (char === quoteChar) {
                // Check if it is an escaped quote
                if (index + 1 < str.length && str[index + 1] === quoteChar) {
                    // Nested quote handling: two consecutive identical quotes are treated as one quote
                    result += char;
                    index += 2; // Skip two quotes
                    continue;
                } else {
                    // Closing quote
                    index++; // Skip the closing quote
                    break;
                }
            } else if (char === '\\') {
                // Handle escape characters
                index++;
                if (index >= str.length) {
                    throw new Error('Unexpected end of string');
                }
                
                const nextChar = str[index];
                switch (nextChar) {
                    case '"':
                    case "'":
                    case '\\':
                    case '/':
                        result += nextChar;
                        break;
                    case 'b':
                        result += '\b';
                        break;
                    case 'f':
                        result += '\f';
                        break;
                    case 'n':
                        result += '\n';
                        break;
                    case 'r':
                        result += '\r';
                        break;
                    case 't':
                        result += '\t';
                        break;
                    case 'u':
                        // Unicode escape
                        if (index + 4 >= str.length) {
                            throw new Error('Incomplete Unicode escape');
                        }
                        const unicode = str.substr(index + 1, 4);
                        result += String.fromCharCode(parseInt(unicode, 16));
                        index += 4;
                        break;
                    default:
                        result += nextChar;
                }
                index++;
            } else {
                result += char;
                index++;
            }
        }

        // Replace commas with slashes (similar to the original function's handling)
        return result.replace(/,/g, '/');
    }

    function parseNumber() {
        let numStr = '';
        
        if (str[index] === '-') {
            numStr += str[index++];
        }

        while (index < str.length && str[index] >= '0' && str[index] <= '9') {
            numStr += str[index++];
        }

        if (str[index] === '.') {
            numStr += str[index++];
            while (index < str.length && str[index] >= '0' && str[index] <= '9') {
                numStr += str[index++];
            }
        }

        if (str[index] === 'e' || str[index] === 'E') {
            numStr += str[index++];
            if (str[index] === '+' || str[index] === '-') {
                numStr += str[index++];
            }
            while (index < str.length && str[index] >= '0' && str[index] <= '9') {
                numStr += str[index++];
            }
        }

        return parseFloat(numStr);
    }

    function parseBoolean() {
        if (str.substr(index, 4) === 'true') {
            index += 4;
            return true;
        } else if (str.substr(index, 5) === 'false') {
            index += 5;
            return false;
        } else {
            throw new Error(`Invalid boolean value at position ${index}`);
        }
    }

    function parseNull() {
        if (str.substr(index, 4) === 'null') {
            index += 4;
            return null;
        } else {
            throw new Error(`Invalid null value at position ${index}`);
        }
    }

    function skipWhitespace() {
        while (index < str.length && /\s/.test(str[index])) {
            index++;
        } 
    }

    try {
        const result = parseValue();
        skipWhitespace();
        
        if (index < str.length) {
            throw new Error(`There are extra characters at position ${index} after parsing`);
        }
        
        console.log('Manual JSON parsing successful:', result);
        return result;
    } catch (error) {
        console.error('JSON parsing error:', error.message);
        throw error;
    }
}

/**
 * Safe JSON parsing function that extracts all JSON arrays from text
 * @param {string} jsonStr - A string containing JSON arrays
 * @returns {Array} A list of parsed JSON arrays
 */
export function safeParse(jsonStr) {
    if (!jsonStr || typeof jsonStr !== 'string') {
        throw new Error('Input must be a valid string');
    }

    const results = [];
    let startIndex = 0;

    // Find all JSON arrays
    while (startIndex < jsonStr.length) {
        const bracketStart = jsonStr.indexOf('[', startIndex);
        if (bracketStart === -1) {
            break; // No more [
        }

        // Find the corresponding ]
        let bracketEnd = -1;
        let bracketCount = 0;
        let inString = false;
        let escapeNext = false;

        for (let i = bracketStart; i < jsonStr.length; i++) {
            const char = jsonStr[i];

            if (escapeNext) {
                escapeNext = false;
                continue;
            }

            if (char === '\\') {
                escapeNext = true;
                continue;
            }

            if (char === '"' || char === "'") {
                inString = !inString;
                continue;
            }

            if (!inString) {
                if (char === '[') {
                    bracketCount++;
                } else if (char === ']') {
                    bracketCount--;
                    if (bracketCount === 0) {
                        bracketEnd = i;
                        break;
                    }
                }
            }
        }

        if (bracketEnd !== -1) {
            // Extract the JSON array string
            const jsonArrayStr = jsonStr.substring(bracketStart, bracketEnd + 1);
            console.log('Found JSON array:', jsonArrayStr);

            try {
                // Prioritize native JSON.parse
                const parsed = JSON.parse(jsonArrayStr);
                results.push(parsed);
                console.log('Successfully parsed JSON array:', parsed);
            } catch (error) {
                console.warn('Native JSON.parse failed, trying manual parsing:', error.message);
                try {
                    const parsed = parseManualJson(jsonArrayStr);
                    results.push(parsed);
                    console.log('Manual parsing successful:', parsed);
                } catch (manualError) {
                    console.error('Manual parsing also failed:', manualError.message);
                    // Continue searching for the next array, do not throw an error
                }
            }

            startIndex = bracketEnd + 1;
        } else {
            // No matching ] found, skip this [
            startIndex = bracketStart + 1;
        }
    }

    if (results.length === 0) {
        console.warn('No valid JSON array found');
        return [];
    }

    console.log(`A total of ${results.length} JSON arrays were parsed:`, results);
    return results;
}