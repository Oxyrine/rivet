"""Standard cost definitions and labour rate table for the billing adapter."""

# Parts standard cost table (in paise: 1 INR = 100 paise)
STANDARD_PART_COSTS_PAISE = {
    'HS-40': 240000,   # ₹2,400 (High-pressure seal kit)
    'O-RING': 15000,   # ₹150 (Viton O-Ring)
    'JACK': 0,         # Standard tooling
}
DEFAULT_PART_COST_PAISE = 50000  # ₹500 default fallback

# Labour rate table: ₹1,500 per hour = 2,500 paise per minute
LABOUR_RATE_PER_MINUTE_PAISE = 2500
MINIMUM_LABOUR_MINUTES = 60

def calculate_parts_cost(parts: dict[str, int]) -> tuple[int, list[dict]]:
    """Calculates total parts cost and itemized invoice lines."""
    total = 0
    lines = []
    for part, qty in parts.items():
        unit_cost = STANDARD_PART_COSTS_PAISE.get(part, DEFAULT_PART_COST_PAISE)
        line_total = unit_cost * qty
        total += line_total
        lines.append({
            'type': 'part',
            'item': part,
            'quantity': qty,
            'unit_cost_paise': unit_cost,
            'line_total_paise': line_total,
            'description': f'{part} (qty {qty}) @ ₹{unit_cost // 100}',
        })
    return total, lines

def calculate_labour_cost(minutes: int | None = None) -> tuple[int, dict]:
    """Calculates labour cost based on duration or minimum slot."""
    duration = max(minutes or 0, MINIMUM_LABOUR_MINUTES)
    total = duration * LABOUR_RATE_PER_MINUTE_PAISE
    line = {
        'type': 'labour',
        'item': 'technician_labour',
        'duration_minutes': duration,
        'rate_per_minute_paise': LABOUR_RATE_PER_MINUTE_PAISE,
        'line_total_paise': total,
        'description': f'Technician field labour ({duration} min @ ₹{LABOUR_RATE_PER_MINUTE_PAISE // 100}/min)',
    }
    return total, line
