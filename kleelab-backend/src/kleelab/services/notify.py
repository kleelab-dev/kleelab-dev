"""Which emails a person has chosen to get.

Optional emails belong to a topic, and everyone can turn a topic off on their
account page. Some emails are never optional: invoices and payment reminders,
sign-in links, security notices and anything a person asked for themselves.

For the team, the topics cover the emails sent to the person looking after a
project. The team inbox and Slack still get everything.
"""

from kleelab.models.user import User

CLIENT_TOPICS: dict[str, tuple[str, str]] = {
    "updates": ("Progress on your project", "A step is finished, we posted news, shared a file or your site went live."),
    "messages": ("Messages from the team", "When someone at KleeLab writes to you on your project."),
    "approvals": ("Work to approve", "When we ask you to look at something and approve it."),
}

STAFF_TOPICS: dict[str, tuple[str, str]] = {
    "messages": ("Client messages and files", "A client on a project you look after writes, uploads a file or asks for something."),
    "approvals": ("Client answers", "A client approves work, asks for changes, finishes their list or answers a proposal."),
    "payments": ("Payments", "An invoice on a project you look after is paid online."),
}


def topics_for(user: User) -> dict[str, tuple[str, str]]:
    return STAFF_TOPICS if user.role == "staff" else CLIENT_TOPICS


def wants(user: User | None, topic: str) -> bool:
    """True unless they turned this topic off. Unknown topics are always sent."""

    if user is None:
        return False
    return (user.email_prefs or {}).get(topic, True) is not False
