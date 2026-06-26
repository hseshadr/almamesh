from enum import Enum

# --- Astrological Enums ---


class PlanetName(str, Enum):
    SUN = "sun"
    MOON = "moon"
    MARS = "mars"
    MERCURY = "mercury"
    JUPITER = "jupiter"
    VENUS = "venus"
    SATURN = "saturn"
    RAHU = "rahu"
    KETU = "ketu"


class ZodiacSign(str, Enum):
    ARIES = "Aries"
    TAURUS = "Taurus"
    GEMINI = "Gemini"
    CANCER = "Cancer"
    LEO = "Leo"
    VIRGO = "Virgo"
    LIBRA = "Libra"
    SCORPIO = "Scorpio"
    SAGITTARIUS = "Sagittarius"
    CAPRICORN = "Capricorn"
    AQUARIUS = "Aquarius"
    PISCES = "Pisces"


class Dignity(str, Enum):
    EXALTED = "exalted"
    DEBILITATED = "debilitated"
    OWN = "own"
    GREAT_FRIEND = "great_friend"
    FRIEND = "friend"
    FRIENDLY = "friend"
    NEUTRAL = "neutral"
    ENEMY = "enemy"
    BITTER_ENEMY = "bitter_enemy"


class DashaSystem(str, Enum):
    VIMSHOTTARI = "vimshottari"
    CHARA = "chara"
    YOGINI = "yogini"


class EventType(str, Enum):
    # Career
    CAREER_CHANGE = "career_change"
    PROMOTION = "promotion"
    JOB_LOSS = "job_loss"
    BUSINESS_START = "business_start"
    # Relationship
    MARRIAGE = "marriage"
    ENGAGEMENT = "engagement"
    BREAKUP = "breakup"
    CHILDBIRTH = "childbirth"
    # Location/Property
    RELOCATION = "relocation"
    PROPERTY_PURCHASE = "property_purchase"
    # Finance
    WINDFALL = "windfall"
    EXPENSE_SHOCK = "expense_shock"
    # Health
    HEALTH_ISSUE = "health_issue"
    SURGERY = "surgery"
    # Education/Legal
    HIGHER_STUDIES = "higher_studies"
    LITIGATION = "litigation"


# --- Zodiac and Sign Constants ---

ZODIAC_SIGNS = [s.value for s in ZodiacSign]

SIGN_LORDS = {
    ZodiacSign.ARIES: PlanetName.MARS,
    ZodiacSign.TAURUS: PlanetName.VENUS,
    ZodiacSign.GEMINI: PlanetName.MERCURY,
    ZodiacSign.CANCER: PlanetName.MOON,
    ZodiacSign.LEO: PlanetName.SUN,
    ZodiacSign.VIRGO: PlanetName.MERCURY,
    ZodiacSign.LIBRA: PlanetName.VENUS,
    ZodiacSign.SCORPIO: PlanetName.MARS,
    ZodiacSign.SAGITTARIUS: PlanetName.JUPITER,
    ZodiacSign.CAPRICORN: PlanetName.SATURN,
    ZodiacSign.AQUARIUS: PlanetName.SATURN,
    ZodiacSign.PISCES: PlanetName.JUPITER,
}

# Exaltation / debilitation signs per BPHS (graha svarupa): single source for
# dignity and for the neecha-bhanga conditions. Nodes carry no classical
# exaltation in the Parashari scheme used here.
EXALTATION_SIGN = {
    PlanetName.SUN: ZodiacSign.ARIES,
    PlanetName.MOON: ZodiacSign.TAURUS,
    PlanetName.MARS: ZodiacSign.CAPRICORN,
    PlanetName.MERCURY: ZodiacSign.VIRGO,
    PlanetName.JUPITER: ZodiacSign.CANCER,
    PlanetName.VENUS: ZodiacSign.PISCES,
    PlanetName.SATURN: ZodiacSign.LIBRA,
}

DEBILITATION_SIGN = {
    PlanetName.SUN: ZodiacSign.LIBRA,
    PlanetName.MOON: ZodiacSign.SCORPIO,
    PlanetName.MARS: ZodiacSign.CANCER,
    PlanetName.MERCURY: ZodiacSign.PISCES,
    PlanetName.JUPITER: ZodiacSign.CAPRICORN,
    PlanetName.VENUS: ZodiacSign.VIRGO,
    PlanetName.SATURN: ZodiacSign.ARIES,
}

# --- Nakshatra Constants ---

NAKSHATRA_NAMES = [
    "Ashwini",
    "Bharani",
    "Krittika",
    "Rohini",
    "Mrigashira",
    "Ardra",
    "Punarvasu",
    "Pushya",
    "Ashlesha",
    "Magha",
    "Purva Phalguni",
    "Uttara Phalguni",
    "Hasta",
    "Chitra",
    "Swati",
    "Vishakha",
    "Anuradha",
    "Jyeshtha",
    "Mula",
    "Purva Ashadha",
    "Uttara Ashadha",
    "Shravana",
    "Dhanishta",
    "Shatabhisha",
    "Purva Bhadrapada",
    "Uttara Bhadrapada",
    "Revati",
]

NAKSHATRA_LORDS = [
    PlanetName.KETU,
    PlanetName.VENUS,
    PlanetName.SUN,
    PlanetName.MOON,
    PlanetName.MARS,
    PlanetName.RAHU,
    PlanetName.JUPITER,
    PlanetName.SATURN,
    PlanetName.MERCURY,
] * 3

# --- Dasha Constants ---

DASHA_YEARS = {
    PlanetName.KETU: 7,
    PlanetName.VENUS: 20,
    PlanetName.SUN: 6,
    PlanetName.MOON: 10,
    PlanetName.MARS: 7,
    PlanetName.RAHU: 18,
    PlanetName.JUPITER: 16,
    PlanetName.SATURN: 19,
    PlanetName.MERCURY: 17,
}

DASHA_SEQUENCE = [
    PlanetName.KETU,
    PlanetName.VENUS,
    PlanetName.SUN,
    PlanetName.MOON,
    PlanetName.MARS,
    PlanetName.RAHU,
    PlanetName.JUPITER,
    PlanetName.SATURN,
    PlanetName.MERCURY,
]

# Chara Dasha durations by sign (years)
CHARA_DASHA_YEARS = {
    ZodiacSign.ARIES: 7,
    ZodiacSign.TAURUS: 8,
    ZodiacSign.GEMINI: 9,
    ZodiacSign.CANCER: 10,
    ZodiacSign.LEO: 11,
    ZodiacSign.VIRGO: 12,
    ZodiacSign.LIBRA: 7,
    ZodiacSign.SCORPIO: 8,
    ZodiacSign.SAGITTARIUS: 9,
    ZodiacSign.CAPRICORN: 10,
    ZodiacSign.AQUARIUS: 11,
    ZodiacSign.PISCES: 12,
}

# Yogini Dasha sequence: (name, lord, years)
YOGINI_SEQUENCE = [
    ("Mangala", PlanetName.MOON, 1),
    ("Pingala", PlanetName.SUN, 2),
    ("Dhanya", PlanetName.JUPITER, 3),
    ("Bhramari", PlanetName.MARS, 4),
    ("Bhadrika", PlanetName.MERCURY, 5),
    ("Ulka", PlanetName.SATURN, 6),
    ("Siddha", PlanetName.VENUS, 7),
    ("Sankata", PlanetName.RAHU, 8),
]

# --- Predictive Probabilities ---

BASE_PROBABILITIES = {
    EventType.CAREER_CHANGE: 0.20,
    EventType.PROMOTION: 0.15,
    EventType.JOB_LOSS: 0.08,
    EventType.BUSINESS_START: 0.05,
    EventType.MARRIAGE: 0.15,
    EventType.ENGAGEMENT: 0.12,
    EventType.BREAKUP: 0.08,
    EventType.CHILDBIRTH: 0.10,
    EventType.RELOCATION: 0.10,
    EventType.PROPERTY_PURCHASE: 0.08,
    EventType.WINDFALL: 0.08,
    EventType.EXPENSE_SHOCK: 0.10,
    EventType.HEALTH_ISSUE: 0.10,
    EventType.SURGERY: 0.05,
    EventType.HIGHER_STUDIES: 0.08,
    EventType.LITIGATION: 0.05,
}

# --- Predictive Weights and Thresholds ---

DASHA_THRESHOLDS = {
    EventType.CAREER_CHANGE: 0.30,
    EventType.PROMOTION: 0.30,
    EventType.MARRIAGE: 0.35,
    EventType.RELOCATION: 0.25,
    EventType.HEALTH_ISSUE: 0.25,
    EventType.WINDFALL: 0.30,
}

CONFLUENCE_MULTIPLIERS = {
    "vim_x_chara": 1.8,
    "vim_x_yogini": 1.3,
    "chara_x_yogini": 1.3,
    "triple_stack": 2.2,
}

SIGNAL_WEIGHTS = {
    "vim_10th_activation": 0.25,
    "vim_7th_activation": 0.20,
    "vim_health_house": 0.15,
    "vim_relocation": 0.15,
    "vim_wealth_house": 0.18,
    "chara_amk_activation": 0.30,
    "chara_dk_activation": 0.25,
    "chara_house_activation": 0.20,
    "yogini_boost": 0.10,
}

DEFAULT_MERGE_GAP_DAYS = 14
