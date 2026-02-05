import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Briefcase,
  GraduationCap,
  MapPin,
  Linkedin,
  Building2,
  Calendar,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface Experience {
  title?: string;
  position?: string;
  company?: string;
  location?: string;
  startDate?: string;
  start?: string;
  endDate?: string;
  end?: string;
  description?: string;
  isCurrent?: boolean;
}

interface Education {
  school?: string;
  degree?: string;
  fieldOfStudy?: string;
  startDate?: string;
  endDate?: string;
}

interface TeamMember {
  name: string;
  role: string;
  linkedinUrl?: string;
  headline?: string;
  summary?: string;
  profilePictureUrl?: string;
  location?: string;
  experience?: Experience[];
  education?: Education[];
  skills?: string[];
  fmfScore?: number;
  relevantExperience?: string;
  background?: string;
}

interface TeamProfileCardProps {
  member: TeamMember;
  showTimelines?: boolean;
}

export function TeamProfileCard({
  member,
  showTimelines = true,
}: TeamProfileCardProps) {
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-chart-2 bg-chart-2/10";
    if (score >= 60) return "text-chart-3 bg-chart-3/10";
    if (score >= 40) return "text-chart-4 bg-chart-4/10";
    return "text-chart-5 bg-chart-5/10";
  };

  const hasExperience = member.experience && member.experience.length > 0;
  const hasEducation = member.education && member.education.length > 0;
  const hasSkills = member.skills && member.skills.length > 0;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="p-6 border-b bg-linear-to-br from-primary/5 to-transparent">
          <div className="flex items-start gap-4">
            <Avatar className="w-20 h-20 border-2 border-background shadow-lg">
              <AvatarImage src={member.profilePictureUrl} alt={member.name} />
              <AvatarFallback className="text-lg font-semibold bg-primary/10">
                {getInitials(member.name)}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-lg font-semibold">{member.name}</h3>
                  <p className="text-sm text-primary font-medium">{member.role}</p>
                </div>
                {member.fmfScore !== undefined && member.fmfScore !== null && (
                  <Badge
                    className={`${getScoreColor(member.fmfScore)} border-0 shrink-0`}
                  >
                    FMF: {member.fmfScore}/100
                  </Badge>
                )}
              </div>

              {member.headline && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                  {member.headline}
                </p>
              )}

              <div className="flex items-center gap-3 mt-2 flex-wrap">
                {member.location && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {member.location}
                  </span>
                )}
                {member.linkedinUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    asChild
                  >
                    <a
                      href={member.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1"
                    >
                      <Linkedin className="w-3 h-3" />
                      LinkedIn
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </div>

          {(member.summary || member.background) && (
            <p className="text-sm text-muted-foreground mt-4 leading-relaxed">
              {member.summary || member.background}
            </p>
          )}

          {member.relevantExperience && (
            <div className="mt-4 p-3 bg-primary/5 rounded-lg">
              <p className="text-sm">
                <span className="font-medium text-primary">
                  Relevant Experience:
                </span>{" "}
                <span className="text-muted-foreground">
                  {member.relevantExperience}
                </span>
              </p>
            </div>
          )}
        </div>

        {showTimelines && (hasExperience || hasEducation) && (
          <div className="p-6 space-y-6">
            {hasExperience && (
              <ExperienceTimeline experiences={member.experience!} />
            )}

            {hasEducation && (
              <EducationTimeline education={member.education!} />
            )}
          </div>
        )}

        {hasSkills && (
          <div className="px-6 pb-6">
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
              Key Skills
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {member.skills!.slice(0, 10).map((skill, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs">
                  {skill}
                </Badge>
              ))}
              {member.skills!.length > 10 && (
                <Badge variant="outline" className="text-xs">
                  +{member.skills!.length - 10} more
                </Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface ExperienceTimelineProps {
  experiences: Experience[];
}

export function ExperienceTimeline({ experiences }: ExperienceTimelineProps) {
  if (!experiences || experiences.length === 0) return null;

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <Briefcase className="w-4 h-4 text-primary" />
        Experience
      </h4>
      <div className="relative pl-6 space-y-4">
        <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-border" />

        {experiences.map((exp, idx) => (
          <div key={idx} className="relative">
            <div
              className={`absolute -left-6 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-background ${
                exp.isCurrent || idx === 0 ? "bg-primary" : "bg-muted"
              }`}
            />

            <div className="space-y-1">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h5 className="text-sm font-medium">
                    {exp.title || exp.position || "Position"}
                  </h5>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Building2 className="w-3 h-3" />
                    <span>{exp.company || "Company"}</span>
                    {exp.location && (
                      <>
                        <span className="text-border">•</span>
                        <span>{exp.location}</span>
                      </>
                    )}
                  </div>
                </div>
                {(exp.startDate || exp.start || exp.endDate || exp.end) && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                    <Calendar className="w-3 h-3" />
                    {exp.startDate || exp.start || "?"} -{" "}
                    {exp.isCurrent || (!exp.endDate && !exp.end)
                      ? "Present"
                      : exp.endDate || exp.end || "?"}
                  </span>
                )}
              </div>
              {exp.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {exp.description}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface EducationTimelineProps {
  education: Education[];
}

export function EducationTimeline({ education }: EducationTimelineProps) {
  if (!education || education.length === 0) return null;

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <GraduationCap className="w-4 h-4 text-primary" />
        Education
      </h4>
      <div className="relative pl-6 space-y-4">
        <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-border" />

        {education.map((edu, idx) => (
          <div key={idx} className="relative">
            <div
              className={`absolute -left-6 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-background ${
                idx === 0 ? "bg-primary" : "bg-muted"
              }`}
            />

            <div className="space-y-1">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h5 className="text-sm font-medium">
                    {edu.school || "Institution"}
                  </h5>
                  {(edu.degree || edu.fieldOfStudy) && (
                    <p className="text-xs text-muted-foreground">
                      {[edu.degree, edu.fieldOfStudy]
                        .filter(Boolean)
                        .join(" in ")}
                    </p>
                  )}
                </div>
                {(edu.startDate || edu.endDate) && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                    <Calendar className="w-3 h-3" />
                    {edu.startDate || "?"} - {edu.endDate || "?"}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface TeamGridProps {
  members: TeamMember[];
  showTimelines?: boolean;
}

export function TeamGrid({ members, showTimelines = true }: TeamGridProps) {
  if (!members || members.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No team member information available.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {members.map((member, idx) => (
        <TeamProfileCard
          key={idx}
          member={member}
          showTimelines={showTimelines}
        />
      ))}
    </div>
  );
}
