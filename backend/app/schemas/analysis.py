from pydantic import BaseModel
from typing import List, Optional


class CostSummary(BaseModel):
    total_cost: float
    period_days: int
    daily_average: float
    cost_change_pct: float
    previous_period_cost: float
    potential_savings: float
    anomaly_count: int
    opportunity_count: int


class ServiceBreakdown(BaseModel):
    service: str
    cost: float
    percentage: float
    change_pct: float


class TeamBreakdown(BaseModel):
    team: str
    cost: float
    percentage: float


class DailyTrend(BaseModel):
    date: str
    cost: float
    is_anomaly: bool
    anomaly_score: Optional[float] = None


class DashboardData(BaseModel):
    summary: CostSummary
    service_breakdown: List[ServiceBreakdown]
    team_breakdown: List[TeamBreakdown]
    daily_trend: List[DailyTrend]
    ai_summary: str


class ChatRequest(BaseModel):
    message: str
    dataset_id: Optional[int] = None
    conversation_id: Optional[str] = None


class ChatMessage(BaseModel):
    id: str
    role: str  # user | assistant
    content: str
    timestamp: str
    sources: Optional[List[str]] = None
    conversation_id: Optional[str] = None   # real DB conversation ID returned to frontend
