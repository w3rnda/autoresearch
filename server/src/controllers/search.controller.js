'use strict';

const prisma = require('../prisma');
const { errorResponse } = require('../utils/response.utils');

/**
 * GET /api/v1/search?q=<term>
 *
 * Searches leads, pipeline deals, and meetings for the given query term.
 * All results are scoped to the authenticated user's organization.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const search = async (req, res, next) => {
  try {
    const { q } = req.query;
    const { organizationId } = req.user;

    if (!q || q.trim().length < 2) {
      return res.status(400).json(errorResponse('Query parameter "q" must be at least 2 characters'));
    }

    const term = q.trim();

    const nameFilter = {
      OR: [
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
        { company: { contains: term, mode: 'insensitive' } },
      ],
    };

    // PipelineDeal and Meeting do not have a direct organizationId column;
    // they are scoped via their lead relation instead.
    const orgLeadFilter = {
      organizationId,
      ...nameFilter,
    };

    const [leads, deals, meetings] = await Promise.all([
      // Search leads by firstName, lastName, email, company
      prisma.lead.findMany({
        where: {
          organizationId,
          OR: [
            { firstName: { contains: term, mode: 'insensitive' } },
            { lastName: { contains: term, mode: 'insensitive' } },
            { email: { contains: term, mode: 'insensitive' } },
            { company: { contains: term, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          company: true,
          status: true,
          score: true,
        },
        take: 5,
      }),

      // Search pipeline deals scoped via lead's organizationId and name/company
      prisma.pipelineDeal.findMany({
        where: {
          lead: orgLeadFilter,
        },
        select: {
          id: true,
          stage: true,
          value: true,
          lead: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
        take: 5,
      }),

      // Search meetings scoped via lead's organizationId and name
      prisma.meeting.findMany({
        where: {
          lead: orgLeadFilter,
        },
        select: {
          id: true,
          scheduledAt: true,
          lead: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
        take: 5,
      }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        leads,
        deals,
        meetings,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { search };
