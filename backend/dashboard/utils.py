import re

def normalize_text_for_diff(html_string):
    """
    Removes HTML tags and normalizes whitespace for diffing purposes.
    - Replaces multiple whitespace characters with a single space.
    - Strips leading/trailing whitespace from each line.
    """
    if not html_string:
        return [] # Return empty list for splitlines expectation
    # 1. Remove HTML tags
    clean = re.compile('<.*?>')
    plain_text = re.sub(clean, '', html_string)
    
    # 2. Normalize whitespace: replace multiple whitespace chars with a single space, then strip line
    #    and filter out empty lines that might result from normalization
    normalized_lines = [re.sub(r'\s+', ' ', line).strip() for line in plain_text.splitlines()]
    
    return [line for line in normalized_lines if line]

def extract_numeric_section_id(section_title):
    """
    Extracts the leading numeric part of a section title (e.g., "1", "1.1", "2.3.4").
    Returns the numeric string or None if not found.
    """
    if not section_title:
        return None
    match = re.match(r'^\s*(\d+(?:\.\d+)*)', section_title)
    if match:
        return match.group(1)
    return None

def normalize_title_text(title):
    """
    Aggressively normalizes a title for grouping purposes.
    - Converts to uppercase.
    - Removes trailing punctuation (: ; . ,).
    - Removes the word 'SECTION' if it's at the end.
    - Removes all non-alphanumeric characters.
    - Collapses multiple spaces.
    """
    if not title:
        return ""
    t = title.strip().upper()
    t = re.sub(r'\s+SECTION$', '', t)
    t = re.sub(r'[:;.,]$', '', t)
    t = re.sub(r'[^A-Z0-9\s]', ' ', t) # Replace non-alphanumeric with space
    return " ".join(t.split())

def normalize_non_plr_title(title):
    """
    Normalizes a section title for non-PLR documents using the shared logic.
    """
    return normalize_title_text(title)

def get_section_sort_key(section_title):
    """
    Creates a sort key for a section title.
    - Boxed Warning first
    - Then sections with numbers, sorted numerically
    - Finally, other sections, sorted alphabetically
    """
    if section_title.upper().startswith('WARNING:'):
        return (-1,)
    
    # Match section numbers like "1", "1.1", "1.1.1"
    match = re.match(r'^\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?.*', section_title)
    if match:
        major = int(match.group(1))
        minor = int(match.group(2)) if match.group(2) else 0
        sub_minor = int(match.group(3)) if match.group(3) else 0
        return (major, minor, sub_minor)
    
    # No section number, sort alphabetically at the end
    return (float('inf'), section_title)
